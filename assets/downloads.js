// downloads.html: every tool's releases, read from its own GitHub repository.
//
// The tree is All tools -> a folder per tool -> its versions. The address names
// what is shown: '' (all tools), a tool's id (#threesprite), or a tool and tag
// (#threesprite/v0.4.0), so a link can open any of them.
document.querySelectorAll('canvas[data-icon]').forEach((c) => c.replaceWith(icon(c.dataset.icon)))

const R = window.DNP_RELEASES
const mine = R.detect()
let state = { releases: [], failed: new Set() }
const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); for (const k of kids) if (k != null && k !== '') e.append(k); return e }
const ext = (href, text) => el('a', { href, textContent: text, target: '_blank', rel: 'noopener' })
const keyOf = (rel) => rel._tool + '/' + rel.tag_name

// inline `code` in a line of release notes, as text nodes and <code>; nothing else is markup
function inline (text) {
  const out = []
  text.replace(/\*\*/g, '').split(/(`[^`]+`)/).forEach((part) => { if (part) out.push(/^`.+`$/.test(part) ? el('code', { textContent: part.slice(1, -1) }) : part) })
  return out
}
// release notes: "## heading" and "- item" lines; every other line is a paragraph
function notes (md) {
  const box = el('div', { className: 'notes' })
  let ul = null
  for (const line of (md || '').split(/\r?\n/)) {
    const t = line.trim()
    if (!t) { ul = null; continue }
    if (t.startsWith('#')) { ul = null; box.append(el('h3', { textContent: t.replace(/^#+\s*/, '') })); continue }
    if (/^[-*]\s/.test(t)) { if (!ul) { ul = el('ul'); box.append(ul) } ul.append(el('li', {}, ...inline(t.slice(2)))); continue }
    ul = null; box.append(el('p', {}, ...inline(t)))
  }
  return box.childNodes.length ? box : null
}

function fileTable (rel) {
  const files = R.filesOf(rel)
  if (!files.length) return { node: el('p', { className: 'empty' }, 'No ready-made builds in this release. ', ext(rel.html_url, 'See it on GitHub')), count: 0, total: 0 }
  // this device's file is the one the Download box would offer
  const pick = R.pickFor(R.onePerSystem(files), mine)
  const table = (rows) => {
    const tb = el('tbody')
    for (const x of rows) {
      const p = R.PLATFORMS[x.platform]
      const link = el('a', { href: x.a.browser_download_url }, icon(x.platform === 'android' ? 'phone' : x.platform ? 'monitor' : 'doc'), x.a.name)
      if (x.platform) link.dataset.platform = x.platform
      const tr = el('tr', {}, el('td', {}, link), el('td', { textContent: p ? `${p.label} (${p.detail})` : 'Other file' }), el('td', { className: 'num', textContent: R.size(x.a.size) }), el('td', { className: 'num', textContent: String(x.a.download_count) }))
      if (x === pick) { tr.className = 'mine'; tr.children[1].textContent += ' · this device' }
      tb.append(tr)
    }
    return el('div', { className: 'tablewrap' }, el('table', { className: 'files' }, el('thead', {}, el('tr', {}, el('th', { textContent: 'Name' }), el('th', { textContent: 'System' }), el('th', { className: 'num', textContent: 'Size' }), el('th', { className: 'num', textContent: 'Downloads' }))), tb))
  }
  // the ordinary builds first; each kind of variant after them, under its own heading
  const groups = new Map([[null, []]])
  for (const x of files) { const k = x.variantInfo || null; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x) }
  const node = el('div', { className: 'filegroups' })
  const split = groups.size > 1
  for (const [v, rows] of groups) {
    if (!rows.length) continue
    // a not-recommended group waits behind a button (a native <details>)
    if (v && /not recommended/i.test(v.group)) {
      const box = el('details', { className: 'fghide' }, el('summary', { className: 'b95', textContent: 'Show the builds ' + v.group.toLowerCase() }))
      if (v.note) box.append(el('p', { className: 'fgnote', textContent: v.note }))
      box.append(table(rows)); node.append(box); continue
    }
    if (split) node.append(v ? el('h3', { className: 'fg', textContent: v.group }) : el('h3', { className: 'fg rec' }, el('span', { textContent: '★ Recommended' })))
    if (split && v && v.note) node.append(el('p', { className: 'fgnote', textContent: v.note }))
    node.append(table(rows))
  }
  return { node, count: files.length, total: files.reduce((t, x) => t + x.a.size, 0) }
}

function releaseBlock (right, rel, heading) {
  const latest = R.latestOf(state.releases, rel._tool)
  const head = el('div', { className: 'rel-h' }, el(heading, { textContent: rel.name || rel.tag_name }))
  if (rel === latest) head.append(el('span', { className: 'badge', textContent: 'Latest' }))
  if (rel.prerelease) head.append(el('span', { className: 'badge night', textContent: 'Nightly' }))
  right.append(head, el('p', { className: 'meta', textContent: `${rel.tag_name} · released ${R.date(rel.published_at)}` }))
  const n = notes(rel.body); if (n) right.append(n)
  const f = fileTable(rel); right.append(f.node)
  return f
}

const repoLine = (tool) => el('p', { className: 'repo' }, 'Source: ', ext(R.repoUrl(tool), 'github.com/' + R.repoOf(tool)))
function noRelease (right, tool) {
  right.append(el('p', { className: 'empty' }, state.failed.has(tool.id)
    ? 'GitHub could not be reached just now, so the releases cannot be listed here. '
    : 'No release yet. It is on its way: watch the repository on GitHub to hear when it lands. ', ext(R.releasesUrl(tool), 'Releases on GitHub')))
}

function select (key, addr, gh) {
  document.querySelectorAll('#tree .node').forEach((n) => n.setAttribute('aria-current', String(n.dataset.key === key)))
  document.getElementById('addr').textContent = addr
  const g = document.getElementById('gh'); g.hidden = !gh; if (gh) g.href = gh
  try { history.replaceState(null, '', location.pathname + location.search + (key ? '#' + key : '')) } catch (e) {}
}

function show (key) {
  const right = document.getElementById('right'); right.replaceChildren()
  const [toolId, tag] = key.split('/')
  const tool = R.TOOLS.find((t) => t.id === toolId)
  const rel = tool && tag ? state.releases.find((r) => r._tool === toolId && r.tag_name === tag) : null
  if (rel) { // one release
    const f = releaseBlock(right, rel, 'h1')
    right.append(el('p', { className: 'hint' }, 'Part of ', el('a', { href: '#' + tool.id, textContent: tool.name }), '. ', tool.blurb), repoLine(tool))
    document.getElementById('st-count').textContent = `${f.count} object(s) · ${R.size(f.total)}`
    return select(key, rel.html_url.replace('https://', ''), rel.html_url)
  }
  if (tool) { // a tool: its latest release, then the older ones
    right.append(el('div', { className: 'rel-h' }, el('h1', { textContent: tool.name })), el('p', { className: 'meta', textContent: tool.blurb }), repoLine(tool))
    const rs = R.releasesOf(state.releases, tool.id)
    const latest = R.latestOf(state.releases, tool.id)
    if (!latest) noRelease(right, tool)
    else {
      releaseBlock(right, latest, 'h2')
      const older = rs.filter((r) => r !== latest)
      if (older.length) {
        right.append(el('h2', { className: 'group', textContent: 'Older versions' }))
        const ul = el('ul', { className: 'older' })
        for (const o of older) ul.append(el('li', {}, el('a', { href: '#' + keyOf(o), textContent: o.name || o.tag_name }), ` · ${R.date(o.published_at)}${o.prerelease ? ' · nightly' : ''}`))
        right.append(ul)
      }
    }
    right.append(el('p', { className: 'hint' }, 'Learn it: ', el('a', { href: 'tutorials/' + tool.track, textContent: 'the tutorial' }), '.'))
    document.getElementById('st-count').textContent = `${rs.length} release(s)`
    return select(tool.id, R.releasesUrl(tool).replace('https://', ''), R.releasesUrl(tool))
  }
  // all tools
  right.append(el('div', { className: 'rel-h' }, el('h1', { textContent: 'All tools' })), el('p', { className: 'meta', textContent: 'Every tool is released on its own, from its own repository. The studio includes the others as plugins; the standalone apps are for working on one thing at a time.' }))
  const tb = el('tbody')
  for (const t of R.TOOLS) {
    const l = R.latestOf(state.releases, t.id)
    const has = l ? R.filesOf(l).map((x) => x.platform).filter(Boolean) : []
    const sys = [has.some((p) => p !== 'android') ? 'Desktop' : null, has.includes('android') ? 'Android' : null].filter(Boolean).join(' · ')
    const latestText = l ? R.versionOf(l) : state.failed.has(t.id) ? 'unreadable' : 'not yet'
    tb.append(el('tr', {}, el('td', {}, el('a', { href: '#' + t.id }, icon(t.icon), t.name)), el('td', { textContent: latestText }), el('td', { textContent: l ? R.date(l.published_at) : '' }), el('td', { textContent: sys }), el('td', {}, ext(R.repoUrl(t), R.repoOf(t).split('/')[1]))))
  }
  right.append(el('div', { className: 'tablewrap' }, el('table', { className: 'files' }, el('thead', {}, el('tr', {}, el('th', { textContent: 'Tool' }), el('th', { textContent: 'Latest' }), el('th', { textContent: 'Released' }), el('th', { textContent: 'Systems' }), el('th', { textContent: 'Repository' }))), tb)))
  right.append(el('p', { className: 'hint', textContent: 'Android builds are sideloaded: allow installs from your browser or file manager when asked.' }))
  document.getElementById('st-count').textContent = `${R.TOOLS.length} tool(s) · ${state.releases.length} release(s)`
  select('', 'github.com/' + R.OWNER, 'https://github.com/' + R.OWNER)
}

function buildTree () {
  const tree = document.getElementById('tree'); tree.replaceChildren()
  const node = (key, ic, label, small) => { const n = el('button', { className: 'node', type: 'button' }, icon(ic), el('span', { textContent: label + ' ' }), small ? el('small', { textContent: small }) : null); n.dataset.key = key; n.addEventListener('click', () => show(key)); return n }
  const root = el('li', {}, node('', 'folder', 'All tools'))
  const tools = el('ul')
  for (const t of R.TOOLS) {
    const li = el('li', {}, node(t.id, t.icon, t.name))
    const vs = el('ul')
    const latest = R.latestOf(state.releases, t.id)
    for (const r of R.releasesOf(state.releases, t.id)) vs.append(el('li', {}, node(keyOf(r), 'disk', R.versionOf(r), r === latest ? '(latest)' : r.prerelease ? '(nightly)' : R.date(r.published_at))))
    li.append(vs); tools.append(li)
  }
  root.append(tools); tree.append(root)
}

// nightly mode: the night sky, the other channel's link, and what it means
if (R.NIGHTLY) {
  document.body.classList.add('nightly')
  document.title = 'Digidream Nightly Builds'
  document.querySelector('.tb .t').textContent = 'Exploring - Digidream Nightly Builds'
  document.querySelector('#task .on').lastChild.textContent = 'Exploring - Digidream Nightly Builds'
}
const other = document.getElementById('channel')
other.textContent = R.NIGHTLY ? 'Stable releases' : 'Nightly builds'
other.href = R.NIGHTLY ? 'downloads.html' : 'downloads.html?nightly'

;(async function () {
  buildTree()
  document.getElementById('st-src').textContent = 'Asking GitHub…'
  state = await R.load()
  document.getElementById('st-src').textContent = state.why
  buildTree()
  show(decodeURIComponent(location.hash.slice(1)))
  window.addEventListener('hashchange', () => show(decodeURIComponent(location.hash.slice(1))))
})()
const ck = document.getElementById('clock'); function tick () { ck.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) } tick(); setInterval(tick, 10000)
