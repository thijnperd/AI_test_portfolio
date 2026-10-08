/* video.js — video mode for Dither Studio (browser only; not loaded by tests).
 *
 * Owns the frame source (a video file, the webcam, or a synthetic clip used by
 * the browser checks), the playback clock, the temporal dithering rules and
 * WebM recording. It deliberately knows nothing about *how* a frame is
 * dithered: app.js hands in an `onFrame(imageData, frameIndex)` callback and
 * gets timing back.
 *
 * Cost control (see DESIGN.md): the working frame is capped on its longest
 * side, the frame rate is capped, and a render that overruns its slot causes
 * frames to be *dropped* rather than queued. Playback can look choppy on a
 * heavy recipe; it never builds a backlog and never pegs a core.
 */
(function (global) {
  'use strict';

  const VIDEO_MAX = 720;   // longest side of the working frame, px
  const FPS_MIN = 1;
  const FPS_MAX = 30;
  const RECORD_MAX_SECONDS = 60;   // runaway guard for the recorder

  function clampFps(fps) {
    const n = Math.round(Number(fps));
    if (!isFinite(n)) return 12;
    return Math.max(FPS_MIN, Math.min(FPS_MAX, n));
  }

  /* A deterministic moving scene, so the browser checks can drive real frames
   * with no codec and no file. Same index always paints the same picture. */
  function drawSynthetic(ctx, width, height, index) {
    const t = index * 0.12;
    const g = ctx.createRadialGradient(
      width / 2 + Math.cos(t) * width * 0.22,
      height / 2 + Math.sin(t * 1.3) * height * 0.22,
      2, width / 2, height / 2, Math.max(width, height) * 0.55
    );
    g.addColorStop(0, '#ffe0b0');
    g.addColorStop(0.45, '#8899bb');
    g.addColorStop(1, '#0a0d18');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 12; i++) {
      const a = t + i * 0.52;
      const x = width / 2 + Math.cos(a) * width * 0.3;
      const y = height / 2 + Math.sin(a * 1.1) * height * 0.3;
      ctx.fillRect(x | 0, y | 0, 7, 7);
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, height * 0.78, width, height * 0.22);
    ctx.fillStyle = '#ffffff';
    ctx.font = Math.round(height * 0.08) + 'px monospace';
    ctx.fillText('frame ' + index, Math.round(height * 0.05), Math.round(height * 0.9));
  }

  function create(opts) {
    opts = opts || {};
    const source = document.createElement('video');
    source.playsInline = true;
    source.muted = true;
    source.loop = true;
    source.preload = 'auto';

    const scratch = document.createElement('canvas');
    const sctx = scratch.getContext('2d', { willReadFrequently: true });

    let mode = 'none';        // 'none' | 'file' | 'webcam' | 'synthetic'
    let objectUrl = null;
    let stream = null;        // webcam MediaStream
    let playing = false;
    let raf = 0;
    let frame = 0;
    let lastTs = 0;
    let lastFrameMs = 0;
    let fps = 12;
    let dropped = 0;
    let framesDrawn = 0;
    let startedAt = 0;

    let recorder = null;
    let recChunks = [];
    let recStartedAt = 0;
    let recStopTimer = 0;
    let recording = false;

    function note(text) {
      if (typeof opts.onStatus === 'function') opts.onStatus(text);
    }

    function sizeTo(width, height) {
      const longest = Math.max(width, height) || 1;
      const scale = longest > VIDEO_MAX ? VIDEO_MAX / longest : 1;
      const w = Math.max(2, Math.round(width * scale) & ~1);
      const h = Math.max(2, Math.round(height * scale) & ~1);
      if (scratch.width !== w || scratch.height !== h) {
        scratch.width = w;
        scratch.height = h;
      }
      return { width: w, height: h };
    }

    function paint(index) {
      const w = scratch.width, h = scratch.height;
      if (mode === 'synthetic') {
        drawSynthetic(sctx, w, h, index);
      } else {
        sctx.drawImage(source, 0, 0, w, h);
      }
    }

    /* Pull one frame at the capped size as ImageData for the dither core. */
    function grab() {
      paint(frame);
      return sctx.getImageData(0, 0, scratch.width, scratch.height);
    }

    function loop(ts) {
      if (!playing) return;
      raf = requestAnimationFrame(loop);
      const interval = 1000 / fps;
      if (!lastTs) lastTs = ts;
      if (ts - lastTs < interval) return;
      lastTs = ts;
      const frameIndex = frame;
      frame++;
      framesDrawn++;
      const t0 = performance.now();
      let imageData = null;
      try {
        imageData = grab();
      } catch (err) {
        // A tainted or not-yet-ready source: skip this frame, keep the loop.
        lastFrameMs = performance.now() - t0;
        return;
      }
      const out = opts.onFrame(imageData, frameIndex);
      lastFrameMs = performance.now() - t0;
      if (typeof out === 'number') lastFrameMs = out;
      // Overrunning a slot means the next frames will be late; count them as
      // dropped so the status bar tells the truth about playback smoothness.
      if (lastFrameMs > interval) {
        dropped += Math.floor(lastFrameMs / interval);
      }
      if (typeof opts.onStats === 'function') opts.onStats(stats());
    }

    function stats() {
      return {
        mode: mode,
        frame: frame,
        drawn: framesDrawn,
        fps: fps,
        ms: Math.round(lastFrameMs * 10) / 10,
        dropped: dropped,
        playing: playing,
        width: scratch.width,
        height: scratch.height,
        recording: recording,
        seconds: recStartedAt ? Math.round((performance.now() - recStartedAt) / 100) / 10 : 0,
        bytes: recChunks.reduce((n, c) => n + c.size, 0)
      };
    }

    function stopSource() {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
      source.removeAttribute('src');
      try { source.load(); } catch (err) { /* nothing to release */ }
    }

    /* Wait for the source to report a usable frame, then size the scratch. */
    function ready() {
      return new Promise((resolve) => {
        const dims = sizeTo(source.videoWidth || 0, source.videoHeight || 0);
        if (source.readyState >= 2 && dims.width > 2) { resolve(dims); return; }
        const done = () => {
          source.removeEventListener('loadeddata', done);
          resolve(sizeTo(source.videoWidth || 0, source.videoHeight || 0));
        };
        source.addEventListener('loadeddata', done, { once: true });
      });
    }

    const api = {
      get mode() { return mode; },
      get playing() { return playing; },
      get frame() { return frame; },
      get recording() { return recording; },
      get fps() { return fps; },

      setFps(value) {
        fps = clampFps(value);
        return fps;
      },

      /* Load a user-picked video file. */
      async load(file) {
        api.pause();
        stopSource();
        mode = 'file';
        frame = 0;
        objectUrl = URL.createObjectURL(file);
        source.src = objectUrl;
        const dims = await ready();
        note('Video: ' + (file.name || 'clip') + ' · ' + dims.width + '×' + dims.height);
        return dims;
      },

      /* Open the webcam. Rejects when the browser or the user refuses. */
      async webcam() {
        api.pause();
        stopSource();
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
        mode = 'webcam';
        frame = 0;
        source.srcObject = stream;
        try { await source.play(); } catch (err) { /* playsInline + muted: usually fine */ }
        source.pause();
        const dims = await ready();
        note('Video: webcam · ' + dims.width + '×' + dims.height);
        return dims;
      },

      /* A generated clip, so tests and demos need no file and no camera. */
      synthetic(width, height) {
        api.pause();
        stopSource();
        mode = 'synthetic';
        frame = 0;
        const dims = sizeTo(width || 640, height || 360);
        paint(0);
        note('Video: generated clip · ' + dims.width + '×' + dims.height);
        return dims;
      },

      /* Render exactly one frame synchronously and return its stats. Pass a
       * clip frame index to render that frame without advancing the counter,
       * which is how a check compares two temporal rules on the same picture. */
      tickOnce(atFrame) {
        const fixed = typeof atFrame === 'number';
        const frameIndex = fixed ? atFrame : frame;
        if (!fixed) frame++;
        framesDrawn++;
        const t0 = performance.now();
        let imageData = null;
        try {
          imageData = grab();
        } catch (err) {
          lastFrameMs = performance.now() - t0;
          return stats();
        }
        opts.onFrame(imageData, frameIndex);
        lastFrameMs = performance.now() - t0;
        return stats();
      },

      play() {
        if (mode === 'file' || mode === 'webcam') {
          const p = source.play();
          if (p && p.catch) p.catch(() => { /* autoplay refusal: keep the loop off */ });
        }
        if (playing) return;
        playing = true;
        lastTs = 0;
        startedAt = performance.now();
        raf = requestAnimationFrame(loop);
      },

      pause() {
        if (!playing) {
          if (mode === 'file' || mode === 'webcam') source.pause();
          return;
        }
        playing = false;
        cancelAnimationFrame(raf);
        raf = 0;
        if (mode === 'file' || mode === 'webcam') source.pause();
      },

      toggle() {
        if (playing) api.pause(); else api.play();
        return playing;
      },

      /* Start recording the dithered canvas into a WebM blob. */
      startRecording() {
        if (recording) return false;
        const canvas = opts.getCanvas && opts.getCanvas();
        if (!canvas || typeof canvas.captureStream !== 'function' ||
            typeof global.MediaRecorder === 'undefined') {
          note('Recording is not supported in this browser.');
          return false;
        }
        let streamOut = null;
        try {
          streamOut = canvas.captureStream(fps);
        } catch (err) {
          note('Recording could not start: ' + err.message);
          return false;
        }
        const types = [
          'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'
        ];
        const mimeType = types.find((t) => {
          try { return MediaRecorder.isTypeSupported(t); } catch (err) { return false; }
        });
        try {
          recorder = mimeType ? new MediaRecorder(streamOut, { mimeType: mimeType })
                             : new MediaRecorder(streamOut);
        } catch (err) {
          note('Recording could not start: ' + err.message);
          return false;
        }
        recChunks = [];
        recorder.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
        recorder.start(250);
        recording = true;
        recStartedAt = performance.now();
        recStopTimer = setTimeout(() => {
          note('Recording stopped at the 60 s cap.');
          api.stopRecording();
        }, RECORD_MAX_SECONDS * 1000);
        note('Recording…');
        return true;
      },

      stopRecording() {
        if (!recording) return Promise.resolve(null);
        clearTimeout(recStopTimer);
        recStopTimer = 0;
        return new Promise((resolve) => {
          recorder.onstop = () => {
            const blob = new Blob(recChunks, { type: 'video/webm' });
            const seconds = Math.round((performance.now() - recStartedAt) / 100) / 10;
            recording = false;
            recorder = null;
            resolve({ blob: blob, seconds: seconds });
          };
          try { recorder.stop(); } catch (err) { recording = false; resolve(null); }
        });
      },

      stats: stats,

      release() {
        api.pause();
        stopSource();
        mode = 'none';
      }
    };

    return api;
  }

  global.DitherVideo = {
    create: create,
    drawSynthetic: drawSynthetic,
    VIDEO_MAX: VIDEO_MAX,
    FPS_MIN: FPS_MIN,
    FPS_MAX: FPS_MAX,
    clampFps: clampFps
  };
})(typeof window !== 'undefined' ? window : globalThis);
