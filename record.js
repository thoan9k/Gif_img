const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ═══════════════════════════════
// CÀI ĐẶT - chỉnh tại đây
// ═══════════════════════════════
const CONFIG = {
  htmlFile:   'vft_animation_v3.html', // tên file HTML
  width:      620,                     // chiều rộng
  height:     520,                     // chiều cao
  fps:        60,                      // frames per second
  duration:   5,                       // số giây record
  outputMp4:  'output.mp4',            // tên file mp4
  outputGif:  'output.gif',            // tên file gif
  framesDir:  './frames',              // thư mục chứa frames
  makeGif:    true,                    // true = xuất thêm GIF
};

// ═══════════════════════════════
// MAIN
// ═══════════════════════════════
(async () => {
  console.log('🚀 Bắt đầu record...');

  // Tạo thư mục frames
  if (fs.existsSync(CONFIG.framesDir)) {
    fs.rmSync(CONFIG.framesDir, { recursive: true });
  }
  fs.mkdirSync(CONFIG.framesDir);

  // Mở browser
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Set kích thước
  await page.setViewport({
    width:  CONFIG.width,
    height: CONFIG.height,
    deviceScaleFactor: 1
  });

  // Load file HTML
  const filePath = 'file:///' + path.resolve(CONFIG.htmlFile).replace(/\\/g, '/');
  console.log('📂 Loading:', filePath);
  await page.goto(filePath, { waitUntil: 'networkidle0' });

  // Đợi animation bắt đầu
  await new Promise(r => setTimeout(r, 200));

  // Tính số frames
  const totalFrames = CONFIG.fps * CONFIG.duration;
  const frameDelay  = 1000 / CONFIG.fps;

  console.log(`🎬 Chụp ${totalFrames} frames (${CONFIG.duration}s @ ${CONFIG.fps}fps)...`);

  // Chụp từng frame
  for (let i = 0; i < totalFrames; i++) {
    const framePath = path.join(
      CONFIG.framesDir,
      `frame_${String(i).padStart(5, '0')}.png`
    );

    await page.screenshot({ path: framePath });
    await new Promise(r => setTimeout(r, frameDelay));

    // Progress
    if (i % 30 === 0) {
      const pct = Math.round((i / totalFrames) * 100);
      console.log(`   ${pct}% (frame ${i}/${totalFrames})`);
    }
  }

  await browser.close();
  console.log('✅ Chụp xong! Đang xuất video...');

  // ── Xuất MP4 ──
  const framesPattern = path.join(CONFIG.framesDir, 'frame_%05d.png');
  const mp4Cmd = [
    'ffmpeg -y',
    `-r ${CONFIG.fps}`,
    `-i "${framesPattern}"`,
    '-c:v libx264',
    '-preset fast',
    '-crf 18',
    '-pix_fmt yuv420p',
    `"${CONFIG.outputMp4}"`
  ].join(' ');

  console.log('🎥 Xuất MP4...');
  execSync(mp4Cmd, { stdio: 'inherit' });
  console.log(`✅ MP4: ${CONFIG.outputMp4}`);

  // ── Xuất GIF (tuỳ chọn) ──
  if (CONFIG.makeGif) {
    console.log('🖼️  Xuất GIF...');

    // Bước 1: tạo palette
    const paletteCmd = [
      'ffmpeg -y',
      `-r ${CONFIG.fps}`,
      `-i "${framesPattern}"`,
      `-vf "fps=30,scale=${CONFIG.width}:-1:flags=lanczos,palettegen"`,
      'palette.png'
    ].join(' ');
    execSync(paletteCmd, { stdio: 'inherit' });

    // Bước 2: render GIF
    const gifCmd = [
      'ffmpeg -y',
      `-r ${CONFIG.fps}`,
      `-i "${framesPattern}"`,
      '-i palette.png',
      `-vf "fps=30,scale=${CONFIG.width}:-1:flags=lanczos,paletteuse"`,
      `"${CONFIG.outputGif}"`
    ].join(' ');
    execSync(gifCmd, { stdio: 'inherit' });
    console.log(`✅ GIF: ${CONFIG.outputGif}`);

    // Xóa palette tạm
    fs.unlinkSync('palette.png');
  }

  // Xóa frames tạm (tuỳ ý)
  // fs.rmSync(CONFIG.framesDir, { recursive: true });

  console.log('\n🎉 Hoàn thành!');
  console.log(`   📹 MP4 : ${CONFIG.outputMp4}`);
  if (CONFIG.makeGif) console.log(`   🖼️  GIF : ${CONFIG.outputGif}`);
})();