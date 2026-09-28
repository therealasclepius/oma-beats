'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { atomicJSON } = require('./files.cjs');

function youtubeURL(raw) {
  if (typeof raw !== 'string' || raw.length > 2048)
    throw Error('Paste a valid YouTube video link.');
  const url = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : 'https://' + raw.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port)
    throw Error('Use a normal YouTube video link.');
  let id;
  if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
  else if (
    ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(url.hostname)
  ) {
    id =
      url.pathname === '/watch'
        ? url.searchParams.get('v')
        : url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)\/?$/)?.[1];
  }
  if (!/^[\w-]{11}$/.test(id || ''))
    throw Error('Use a YouTube video URL, not a playlist or channel.');
  return 'https://www.youtube.com/watch?v=' + id;
}
function importRequest(value) {
  if (!value || typeof value !== 'object') throw Error('Invalid import request.');
  const url = youtubeURL(value.url),
    start = value.start ?? 0,
    duration = value.duration ?? 30;
  if (typeof start !== 'number' || !Number.isFinite(start) || start < 0 || start > 86400)
    throw Error('Start must be between 0 and 86,400 seconds.');
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 1 || duration > 120)
    throw Error('Choose a clip from 1 to 120 seconds.');
  return { url, start, duration };
}
class ClipImporter {
  constructor(root) {
    this.root = root;
    this.jobs = new Map();
    this.children = new Set();
    this.closed = false;
  }
  async init() {
    await fs.mkdir(path.join(this.root, 'clips'), { recursive: true });
    await fs.rm(path.join(this.root, 'temp'), { recursive: true, force: true });
    return this;
  }
  run(command, args, cwd, timeout = 180000) {
    return new Promise((resolve, reject) => {
      if (this.closed) return reject(Error('App is closing.'));
      const child = spawn(command, args, {
        cwd,
        windowsHide: true,
        shell: false,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      this.children.add(child);
      let output = '',
        timedOut = false;
      const collect = (chunk) => {
        output = (output + chunk.toString()).slice(-12000);
      };
      child.stdout.on('data', collect);
      child.stderr.on('data', collect);
      const timer = setTimeout(() => {
        timedOut = true;
        this.kill(child);
      }, timeout);
      child.on('error', (error) => {
        clearTimeout(timer);
        this.children.delete(child);
        reject(
          Error(
            error.code === 'ENOENT'
              ? `YouTube import needs ${command} installed and available on PATH. Local audio works without it.`
              : error.message
          )
        );
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        this.children.delete(child);
        if (!code && !timedOut) return resolve(output);
        reject(
          Error(
            timedOut
              ? 'The import timed out. Try a shorter clip.'
              : (
                  output.match(/ERROR:[^\n]+/)?.[0] ||
                  `${command} could not process this clip. Try another public video.`
                ).slice(0, 350)
          )
        );
      });
    });
  }
  kill(child) {
    if (!child.pid) return;
    if (process.platform === 'win32')
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore'
      }).on('error', () => child.kill());
    else {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }
  }
  close() {
    this.closed = true;
    for (const child of this.children) this.kill(child);
  }
  async library() {
    const clips = [];
    for (const name of await fs.readdir(path.join(this.root, 'clips'))) {
      if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
      try {
        const data = JSON.parse(await fs.readFile(path.join(this.root, 'clips', name), 'utf8'));
        if (data.id !== name.slice(0, -5)) continue;
        await fs.access(path.join(this.root, 'clips', data.id + '.wav'));
        clips.push(data);
      } catch {}
    }
    return clips.sort((a, b) => b.created - a.created);
  }
  async start(value) {
    const request = importRequest(value);
    for (const [id, job] of this.jobs)
      if (Date.now() - job.created > 3600000 && ['ready', 'error'].includes(job.status))
        this.jobs.delete(id);
    if ([...this.jobs.values()].filter((j) => !['ready', 'error'].includes(j.status)).length >= 2)
      throw Error('Two clips are importing. Wait for one to finish.');
    const existing = (await this.library()).find(
      (c) => c.url === request.url && c.start === request.start && c.duration === request.duration
    );
    const id = randomUUID();
    this.jobs.set(id, { status: 'queued', message: 'Preparing your clip…', created: Date.now() });
    if (existing)
      this.jobs.set(id, {
        status: 'ready',
        message: 'Loaded from your sample library.',
        title: existing.title,
        audio: '/api/library/' + existing.id + '.wav',
        created: Date.now()
      });
    else void this.download(id, request);
    return id;
  }
  async download(id, request) {
    const folder = path.join(this.root, 'temp', id),
      job = this.jobs.get(id);
    try {
      await fs.mkdir(folder, { recursive: true });
      await this.run('ffmpeg', ['-version'], folder, 10000);
      job.status = 'downloading';
      job.message = 'Downloading the selected clip…';
      await this.run(
        'yt-dlp',
        [
          '--ignore-config',
          '--no-playlist',
          '--no-progress',
          '--no-warnings',
          '--socket-timeout',
          '20',
          '--retries',
          '1',
          '--fragment-retries',
          '1',
          '--match-filters',
          '!is_live',
          '--max-filesize',
          '80M',
          '-f',
          'bestaudio/best',
          '--download-sections',
          `*${request.start}-${request.start + request.duration}`,
          '--write-info-json',
          '-o',
          'source.%(ext)s',
          '--',
          request.url
        ],
        folder
      );
      const files = await fs.readdir(folder);
      const media = files.find((f) => /^source\./.test(f) && !/\.(json|part|ytdl)$/.test(f));
      if (!media) throw Error('The video did not return an audio clip.');
      job.status = 'processing';
      job.message = 'Preparing audio for the chop editor…';
      await this.run(
        'ffmpeg',
        [
          '-nostdin',
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-i',
          path.join(folder, media),
          '-t',
          String(request.duration),
          '-vn',
          '-ar',
          '44100',
          '-ac',
          '2',
          '-c:a',
          'pcm_s16le',
          path.join(folder, 'clip.wav')
        ],
        folder,
        60000
      );
      const size = (await fs.stat(path.join(folder, 'clip.wav'))).size;
      if (size < 100 || size > 24 * 1024 ** 2)
        throw Error('This clip has an unexpected audio size.');
      let title = 'YouTube clip';
      try {
        title = String(
          JSON.parse(await fs.readFile(path.join(folder, 'source.info.json'), 'utf8')).title ||
            title
        ).slice(0, 100);
      } catch {}
      await fs.copyFile(path.join(folder, 'clip.wav'), path.join(this.root, 'clips', id + '.wav'));
      await atomicJSON(path.join(this.root, 'clips', id + '.json'), {
        id,
        ...request,
        title,
        created: Date.now()
      });
      Object.assign(job, {
        status: 'ready',
        message: 'Clip ready.',
        title,
        audio: '/api/library/' + id + '.wav'
      });
    } catch (error) {
      Object.assign(job, { status: 'error', message: error.message });
    } finally {
      await fs.rm(folder, { recursive: true, force: true }).catch(() => {});
    }
  }
}
module.exports = { youtubeURL, importRequest, ClipImporter };
