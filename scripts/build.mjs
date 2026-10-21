// Build the site into dist/: the pages and assets here, with the tutorials bundled under tutorials/.
//
//   node scripts/build.mjs                         # tutorials from ../tutorials (the workspace layout)
//   node scripts/build.mjs --tutorials <folder>    # from anywhere else, e.g. a CI checkout
//   node scripts/build.mjs --out <folder>          # somewhere other than dist/
//   node scripts/build.mjs --no-releases           # skip the releases snapshot
//
// The tools come from tools.md: their cards are written into index.html, and
// assets/tools.js gives the pages' scripts the same list. A mistake there (a
// missing field, a screenshot or tutorial page that does not exist) stops the
// build with the line it is on.
//
// It also writes assets/releases.json, a snapshot of every tool's GitHub
// releases, which the pages read before asking GitHub themselves. It uses
// GITHUB_TOKEN when set (the Pages workflow sets it), else the local gh login,
// else no token at all; a repository it cannot read is left out, and the
// pages then ask GitHub for that one directly.
//
// The tutorials are their own repository (projectdigidream/digidream-tutorials)
// and stay a plain static site: everything in them is relative, so copying the
// folder under tutorials/ is all bundling takes. Their authoring files, tools
// and history are left out.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readdirSync, statSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import vm from 'node:vm'
import { parseTools, cardHtml, toolsJs } from './tools.mjs'
import { dirname, join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 ? resolve(process.argv[i + 1]) : fallback }
const OUT = arg('--out', join(ROOT, 'dist'))
const TUT = arg('--tutorials', resolve(ROOT, '..', 'tutorials'))

const SITE = ['index.html', 'downloads.html', '404.html', 'digidream-website', 'assets']
const SKIP_IN_TUTORIALS = new Set(['.git', '.github', 'node_modules', 'tools', 'AUTHORING.md', 'README.md', '.gitignore', '.DS_Store'])

if (!existsSync(join(TUT, 'assets', 'nav.js'))) {
  console.error(`no tutorials at ${TUT} (expected assets/nav.js there); pass --tutorials <folder>`)
  process.exit(1)
}
// the tools, checked before anything is written
const { tools, problems } = parseTools(readFileSync(join(ROOT, 'tools.md'), 'utf8'))
const icons = readFileSync(join(ROOT, 'assets', 'icons.js'), 'utf8')
for (const t of tools) {
  const at = `tools.md:${t.line} (${t.name})`
  if (t.screenshot && !existsSync(join(ROOT, 'assets', 'shots', t.screenshot))) problems.push(`${at}: no screenshot assets/shots/${t.screenshot}`)
  if (t.icon && !new RegExp('(^|\\W)' + t.icon + ':\\[|ICONS\\.' + t.icon + '=').test(icons)) problems.push(`${at}: no icon "${t.icon}" in assets/icons.js`)
  const page = t.tutorial && join(TUT, t.tutorial.endsWith('/') ? t.tutorial + 'index.html' : t.tutorial)
  if (page && !existsSync(page)) problems.push(`${at}: no tutorial page ${t.tutorial} in ${TUT}`)
}
if (problems.length) {
  console.error('tools.md needs fixing:\n  ' + problems.join('\n  '))
  process.exit(1)
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
for (const f of SITE) cpSync(join(ROOT, f), join(OUT, f), { recursive: true, filter: (p) => basename(p) !== '.DS_Store' })
cpSync(TUT, join(OUT, 'tutorials'), { recursive: true, filter: (p) => p === TUT || !SKIP_IN_TUTORIALS.has(basename(p)) })
writeFileSync(join(OUT, '.nojekyll'), '') // GitHub Pages: serve files as they are

// the tools into the pages
writeFileSync(join(OUT, 'assets', 'tools.js'), toolsJs(tools))
const OWNER = /OWNER = '([^']+)'/.exec(readFileSync(join(ROOT, 'assets', 'releases.js'), 'utf8'))[1]
let index = readFileSync(join(OUT, 'index.html'), 'utf8')
const CARDS = '<!-- tools: the cards are written here from tools.md by scripts/build.mjs -->'
if (!index.includes(CARDS)) { console.error('index.html has lost the line the cards go in: ' + CARDS); process.exit(1) }
index = index.replace(CARDS, tools.map((t) => cardHtml(t, OWNER)).join('\n')).replace('<!-- tools-count -->', String(tools.length))
writeFileSync(join(OUT, 'index.html'), index)

// Every page's own scripts and styles get ?v=<this build>, so a browser that
// cached the last deploy's files (Pages lets it keep them 10 minutes) fetches
// the new ones with the new page instead of mixing the two.
const STAMP = Date.now().toString(36)
for (const page of ['index.html', 'downloads.html']) {
  const f = join(OUT, page)
  writeFileSync(f, readFileSync(f, 'utf8').replace(/((?:src|href)="(?:assets|tutorials\/assets)\/[^"?]+\.(?:js|css))"/g, `$1?v=${STAMP}"`))
}

if (!process.argv.includes('--no-releases')) await snapshotReleases(join(OUT, 'assets', 'releases.json'))

async function snapshotReleases (file) {
  // the repository list is the one the pages use: run releases.js with just enough of a browser
  const ctx = { window: {}, document: { currentScript: null }, location: { href: 'https://example.invalid/' }, navigator: { userAgent: '' }, URL }
  vm.runInNewContext(toolsJs(tools) + readFileSync(join(ROOT, 'assets', 'releases.js'), 'utf8'), ctx)
  const R = ctx.window.DNP_RELEASES
  let token = process.env.GITHUB_TOKEN || ''
  if (!token) { try { token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch (e) {} }
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'digidream-website-build', ...(token ? { Authorization: 'Bearer ' + token } : {}) }
  const slim = (rel) => ({
    tag_name: rel.tag_name, name: rel.name, published_at: rel.published_at, prerelease: rel.prerelease, draft: rel.draft, html_url: rel.html_url, body: rel.body,
    assets: rel.assets.map((a) => ({ name: a.name, size: a.size, download_count: a.download_count, browser_download_url: a.browser_download_url }))
  })
  const repos = {}
  for (const t of R.TOOLS) {
    const repo = R.repoOf(t)
    try {
      const res = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=30`, { headers })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      repos[repo] = (await res.json()).filter((x) => !x.draft).map(slim)
      console.log(`  releases: ${repo}: ${repos[repo].length} (${repos[repo].filter((x) => x.prerelease).length} nightly)`)
    } catch (e) { console.warn(`  releases: ${repo}: not read (${e.message}); the pages will ask GitHub for it`) }
  }
  writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), repos }) + '\n')
}

let files = 0; let bytes = 0
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); const s = statSync(p); if (s.isDirectory()) walk(p); else { files++; bytes += s.size } } }
walk(OUT)
console.log(`built ${OUT}: ${files} files, ${(bytes / 1048576).toFixed(1)} MB (tutorials from ${TUT})`)
