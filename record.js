const puppeteer    = require('puppeteer');
const fs           = require('fs');
const path         = require('path');
const { execSync } = require('child_process');

 

// ═══════════════════════════════════════════════════
//  CÀI ĐẶT
// ═══════════════════════════════════════════════════
const CONFIG = {
  htmlFile:   'vft_animation_v3.html',
  width:       620,
  height:      520,
  fps:          60,        // frames/giây
  duration:      7,        // số giây record
  outputMp4: 'output.mp4',
  outputGif: 'output.gif',
  framesDir: './frames',
  makeGif:     true,
  gifFps:       24,
  gifScale:    620,
  keepFrames: false,
  bgColor:   '#000000',    // màu nền (tránh trắng xóa)
};

 

// ─── helpers ────────────────────────────────────────
const log = {
  info:  m => console.log(`\x1b[36m${m}\x1b[0m`),
  ok:    m => console.log(`\x1b[32m${m}\x1b[0m`),
  warn:  m => console.log(`\x1b[33m${m}\x1b[0m`),
  err:   m => console.log(`\x1b[31m${m}\x1b[0m`),
  plain: m => console.log(m),
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
function bar(i, total, w = 35) {
  const p = i / total;
  const b = '█'.repeat(Math.round(p*w)) + '░'.repeat(w - Math.round(p*w));
  process.stdout.write(`\r  [${b}] ${String(Math.round(p*100)).padStart(3)}%  ${i}/${total}`);
}

 
 

 

// ═══════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════
(async () => {
  const t0 = Date.now();
  log.info('\n╔══════════════════════════════════╗');
  log.info('║   VFT Recorder v4 — Seek Mode    ║');
  log.info('╚══════════════════════════════════╝\n');

 

  // ── Kiểm tra ────────────────────────────────────
  const htmlAbs = path.resolve(CONFIG.htmlFile);
  if (!fs.existsSync(htmlAbs)) {
    log.err(`❌ Không tìm thấy: ${CONFIG.htmlFile}`); process.exit(1);
  }
  try { execSync('ffmpeg -version', { stdio: 'ignore' }); }
  catch { log.err('❌ FFmpeg chưa cài.'); process.exit(1); }

 

  if (fs.existsSync(CONFIG.framesDir))
    fs.rmSync(CONFIG.framesDir, { recursive: true, force: true });
  fs.mkdirSync(CONFIG.framesDir, { recursive: true });

 

  const totalFrames = CONFIG.fps * CONFIG.duration;
  const msPerFrame  = 1000 / CONFIG.fps;

 

  log.plain(`📋 ${CONFIG.htmlFile} | ${CONFIG.fps}fps | ${CONFIG.duration}s | ${totalFrames} frames\n`);

 

  // ── Mở browser ──────────────────────────────────
  log.info('🌐 Khởi động browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--allow-file-access-from-files',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--force-color-profile=srgb',
    ],
  });

 

  const page = await browser.newPage();
  await page.setViewport({ width: CONFIG.width, height: CONFIG.height, deviceScaleFactor: 1 });

 

  // ── FREEZE ngay khi load ─────────────────────────
  await page.evaluateOnNewDocument((bg) => {
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.id = '__vft_init';
      s.textContent = `
        html, body { background: ${bg} !important; }
        *, *::before, *::after { animation-play-state: paused !important; }
      `;
      document.head.prepend(s);
    });
  }, CONFIG.bgColor);

 

  // ── Load HTML ───────────────────────────────────
  log.info('📂 Loading HTML...');
  const fileUrl = 'file:///' + htmlAbs.replace(/\\/g, '/');
  await page.goto(fileUrl, { waitUntil: 'load', timeout: 30000 });
  await sleep(800);

 

  // ════════════════════════════════════════════════
  //  CORE TECHNIQUE: Seek từng frame bằng
  //  animation-delay âm
  //
  //  Ý tưởng:
  //  - Pause tất cả animation
  //  - Với mỗi frame i: set animation-delay = -(i * msPerFrame)
  //    → browser vẽ đúng trạng thái tại thời điểm đó
  //  - Chụp screenshot
  //  - Lặp lại cho frame tiếp theo
  //
  //  Điều này đảm bảo VIDEO khớp 100% với animation
  //  bất kể Puppeteer chụp nhanh hay chậm
  // ════════════════════════════════════════════════

 

  // Thu thập thông tin animation gốc
  log.info('🔍 Phân tích CSS animations...');

 

  const animInfo = await page.evaluate(() => {
    // Xóa freeze style
    const init = document.getElementById('__vft_init');
    if (init) init.remove();

 

    // Chạy animation 1 tick để CSS apply
    document.querySelectorAll('*').forEach(el => {
      el.style.animationPlayState = 'running';
      el.style.animationName = 'none';
      void el.offsetWidth;
      el.style.animationName = '';
      void el.offsetWidth;
      el.style.animationPlayState = 'paused'; // pause ngay
    });

 

    // Thu thập info từng element
    const result = [];
    document.querySelectorAll('*').forEach((el, idx) => {
      const cs = getComputedStyle(el);
      if (cs.animationName && cs.animationName !== 'none') {
        // Lưu delay gốc (giây)
        const delayStr  = cs.animationDelay;
        const delaysSec = delayStr.split(',').map(d => parseFloat(d.trim()));
        result.push({
          selector:     el.tagName + (el.id ? '#'+el.id : '') + (el.className ? '.'+[...el.classList].join('.') : ''),
          originalDelay: delaysSec,
          animCount:    delaysSec.length,
        });
        // Lưu delay gốc vào dataset để dùng lại
        el.dataset.__origDelay = delayStr;
      }
    });
    return result;
  });

 

  log.plain(`   Tìm thấy ${animInfo.length} elements có animation`);
  animInfo.slice(0, 5).forEach(a => log.plain(`   → ${a.selector}: delay=[${a.originalDelay.map(d=>d+'s').join(',')}]`));
  if (animInfo.length > 5) log.plain(`   ... và ${animInfo.length - 5} elements khác`);

 

  log.ok(`\n✅ Sẵn sàng chụp theo seek mode!\n`);

 
  // ════════════════════════════════════════════════
  //  CHỤP FRAMES — Seek mode
  // ════════════════════════════════════════════════
  log.info(`🎬 Chụp ${totalFrames} frames...\n`);

 

  for (let i = 0; i < totalFrames; i++) {
    const frameTimeSec = (i * msPerFrame) / 1000;  // thời điểm frame (giây)

 

    // Seek tất cả animation đến frameTimeSec
    await page.evaluate((seekSec) => {
      document.querySelectorAll('*').forEach(el => {
        const origDelayStr = el.dataset.__origDelay;
        if (!origDelayStr) return;

 

        const cs = getComputedStyle(el);
        if (!cs.animationName || cs.animationName === 'none') return;

 

        // Tính delay mới: origDelay - seekTime
        // animation-delay âm = bắt đầu từ giữa chừng
        const origDelays = origDelayStr.split(',').map(d => parseFloat(d.trim()));
        const newDelays  = origDelays.map(d => (d - seekSec).toFixed(6) + 's');

 

        el.style.animationDelay     = newDelays.join(',');
        el.style.animationPlayState = 'paused';  // giữ paused
        el.style.animationName      = 'none';    // reset
        void el.offsetWidth;                      // reflow
        el.style.animationName      = '';         // restore → apply delay mới
      });

 

      // Force render
      void document.body.offsetHeight;
    }, frameTimeSec);

 

    // Đợi browser paint frame này
    await page.evaluate(() => new Promise(resolve => {
      // Dùng requestAnimationFrame thật để đồng bộ với paint cycle
      const raf = window.__realRaf || window.requestAnimationFrame;
      raf(() => raf(resolve));
    }));

 

    // Chụp
    const framePath = path.join(CONFIG.framesDir, `frame_${String(i).padStart(5,'0')}.png`);
    await page.screenshot({ path: framePath, type: 'png', omitBackground: false });

 

    bar(i + 1, totalFrames);
  }

 

  console.log('\n');
  await browser.close();
  log.ok('✅ Chụp frames xong!\n');

 

  // ── Xuất MP4 ────────────────────────────────────
  log.info('🎥 Xuất MP4...');
  const glob = path.join(CONFIG.framesDir, 'frame_%05d.png');
  try {
    execSync([
      'ffmpeg -y',
      `-r ${CONFIG.fps}`,
      `-i "${glob}"`,
      '-c:v libx264 -preset slow -crf 15',
      '-pix_fmt yuv420p -movflags +faststart',
      `"${CONFIG.outputMp4}"`,
    ].join(' '), { stdio: 'inherit' });
    const sz = (fs.statSync(CONFIG.outputMp4).size/1024/1024).toFixed(2);
    log.ok(`✅ MP4: ${CONFIG.outputMp4} (${sz} MB)\n`);
  } catch(e) { log.err(`❌ MP4: ${e.message}`); }

 

  // ── Xuất GIF ────────────────────────────────────
  if (CONFIG.makeGif) {
    log.info('🖼️  Xuất GIF...');
    try {
      const pal = path.join(CONFIG.framesDir, 'palette.png');
      execSync(`ffmpeg -y -r ${CONFIG.fps} -i "${glob}" -vf "fps=${CONFIG.gifFps},scale=${CONFIG.gifScale}:-1:flags=lanczos,palettegen=max_colors=256:stats_mode=full" "${pal}"`, { stdio: 'ignore' });
      execSync(`ffmpeg -y -r ${CONFIG.fps} -i "${glob}" -i "${pal}" -lavfi "fps=${CONFIG.gifFps},scale=${CONFIG.gifScale}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5" "${CONFIG.outputGif}"`, { stdio: 'inherit' });
      const sz = (fs.statSync(CONFIG.outputGif).size/1024/1024).toFixed(2);
      log.ok(`✅ GIF: ${CONFIG.outputGif} (${sz} MB)\n`);
    } catch(e) { log.err(`❌ GIF: ${e.message}`); }
  }

 

  if (!CONFIG.keepFrames)
    fs.rmSync(CONFIG.framesDir, { recursive: true, force: true });

 

  const elapsed = ((Date.now()-t0)/1000).toFixed(1);
  log.info('╔══════════════════════════════════╗');
  log.ok( '║         🎉 HOÀN THÀNH!           ║');
  log.info('╚══════════════════════════════════╝');
  log.plain(`\n   ⏱️  Xử lý: ${elapsed}s  →  Video: ${CONFIG.duration}s thực tế`);
  log.plain(`   📹  ${CONFIG.outputMp4}`);
  if (CONFIG.makeGif) log.plain(`   🖼️   ${CONFIG.outputGif}`);
  log.plain('');

 

})().catch(err => {
  console.error('\n❌', err.stack || err.message);
  process.exit(1);
});