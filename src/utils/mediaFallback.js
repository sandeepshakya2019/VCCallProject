/**
 * Creates a synthetic fallback MediaStream (with a canvas avatar and silent audio)
 * Ensures WebRTC peer calling never fails when physical webcam/mic is blocked,
 * locked by another browser tab, or unavailable in insecure contexts (HTTP IP).
 */
export function createSyntheticStream(userName = 'User') {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');

    if (!ctx) return new MediaStream();

    // Dark background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Flip horizontally so when the local/preview video applies -scale-x-100, the name and letters render normally (not reversed)
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);

    // Gradient avatar circle
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#4f46e5');
    grad.addColorStop(1, '#9333ea');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2 - 25, 55, 0, Math.PI * 2);
    ctx.fill();

    // User initial
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const initial = (userName.trim()[0] || 'U').toUpperCase();
    ctx.fillText(initial, canvas.width / 2, canvas.height / 2 - 25);

    // User Name
    ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(userName || 'User', canvas.width / 2, canvas.height / 2 + 55);

    // Camera placeholder note
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.fillText('(Camera not active)', canvas.width / 2, canvas.height / 2 + 85);

    ctx.restore();

    const videoStream = canvas.captureStream ? canvas.captureStream(10) : null;
    const videoTrack = videoStream ? videoStream.getVideoTracks()[0] : null;

    // Create silent audio track
    let audioTrack = null;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        const osc = audioCtx.createOscillator();
        const dst = osc.connect(audioCtx.createMediaStreamDestination());
        osc.start();
        audioTrack = dst.stream.getAudioTracks()[0];
        if (audioTrack) audioTrack.enabled = false;
      }
    } catch (e) {
      // AudioContext not supported in this environment
    }

    const tracks = [];
    if (videoTrack) tracks.push(videoTrack);
    if (audioTrack) tracks.push(audioTrack);

    return new MediaStream(tracks);
  } catch (err) {
    console.warn('Could not generate synthetic stream:', err);
    return new MediaStream();
  }
}
