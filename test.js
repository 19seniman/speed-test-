const https = require('https');

const HOST = 'speed.cloudflare.com';

// ---------- Helper: request dengan pengukuran waktu ----------
function timedRequest({ method, path, bodySize = 0 }) {
  return new Promise((resolve, reject) => {
    const start = process.hrtime.bigint();
    let firstByteTime = null;
    let bytesReceived = 0;

    const req = https.request(
      {
        host: HOST,
        path,
        method,
        headers:
          method === 'POST'
            ? {
                'Content-Type': 'application/octet-stream',
                'Content-Length': bodySize,
              }
            : {},
      },
      (res) => {
        res.on('data', (chunk) => {
          if (firstByteTime === null) {
            firstByteTime = process.hrtime.bigint();
          }
          bytesReceived += chunk.length;
        });

        res.on('end', () => {
          const end = process.hrtime.bigint();
          resolve({
            totalMs: Number(end - start) / 1e6,
            ttfbMs: firstByteTime
              ? Number(firstByteTime - start) / 1e6
              : Number(end - start) / 1e6,
            bytesReceived,
          });
        });
      }
    );

    req.on('error', reject);

    if (method === 'POST') {
      // Kirim data acak sebesar bodySize untuk uji upload
      const chunkSize = 64 * 1024;
      let sent = 0;
      const buffer = Buffer.alloc(chunkSize, 'a');

      function writeChunk() {
        while (sent < bodySize) {
          const remaining = bodySize - sent;
          const toWrite = Math.min(chunkSize, remaining);
          const ok = req.write(buffer.slice(0, toWrite));
          sent += toWrite;
          if (!ok) {
            req.once('drain', writeChunk);
            return;
          }
        }
        req.end();
      }
      writeChunk();
    } else {
      req.end();
    }
  });
}

// ---------- Ping / Latency ----------
async function testPing(samples = 5) {
  const latencies = [];
  for (let i = 0; i < samples; i++) {
    const result = await timedRequest({ method: 'GET', path: '/__down?bytes=0' });
    latencies.push(result.totalMs);
  }
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const jitter =
    latencies.length > 1
      ? latencies.slice(1).reduce((sum, val, i) => sum + Math.abs(val - latencies[i]), 0) /
        (latencies.length - 1)
      : 0;
  return { avgMs: avg, jitterMs: jitter, samples: latencies };
}

// ---------- Download Speed ----------
async function testDownload(bytes = 25_000_000) {
  const result = await timedRequest({ method: 'GET', path: `/__down?bytes=${bytes}` });
  const seconds = result.totalMs / 1000;
  const mbps = (result.bytesReceived * 8) / seconds / 1_000_000;
  return { mbps, bytes: result.bytesReceived, seconds };
}

// ---------- Upload Speed ----------
async function testUpload(bytes = 10_000_000) {
  const result = await timedRequest({ method: 'POST', path: '/__up', bodySize: bytes });
  const seconds = result.totalMs / 1000;
  const mbps = (bytes * 8) / seconds / 1_000_000;
  return { mbps, bytes, seconds };
}

// ---------- Main: Start Speed Test ----------
async function startSpeedTest() {
  console.log('🚀 Memulai Speed Test...\n');

  try {
    process.stdout.write('📡 Mengukur ping...      ');
    const ping = await testPing();
    console.log(`${ping.avgMs.toFixed(1)} ms (jitter ${ping.jitterMs.toFixed(1)} ms)`);

    process.stdout.write('⬇️  Mengukur download...  ');
    const download = await testDownload();
    console.log(`${download.mbps.toFixed(2)} Mbps`);

    process.stdout.write('⬆️  Mengukur upload...    ');
    const upload = await testUpload();
    console.log(`${upload.mbps.toFixed(2)} Mbps`);

    console.log('\n===== Hasil Speed Test =====');
    console.log(`Ping     : ${ping.avgMs.toFixed(1)} ms`);
    console.log(`Jitter   : ${ping.jitterMs.toFixed(1)} ms`);
    console.log(`Download : ${download.mbps.toFixed(2)} Mbps`);
    console.log(`Upload   : ${upload.mbps.toFixed(2)} Mbps`);
    console.log('=============================');
  } catch (err) {
    console.error('\n❌ Speed test gagal:', err.message);
    console.error('Pastikan koneksi internet aktif dan tidak diblokir firewall/proxy.');
  }
}

// Jalankan otomatis jika file dieksekusi langsung
if (require.main === module) {
  startSpeedTest();
}

module.exports = { startSpeedTest, testPing, testDownload, testUpload };
