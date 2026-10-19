// Releases: the main page's Download box and downloads.html read them from here.
//
// Every tool is released from its own GitHub repository, named in tools.md. The page
// asks GitHub for each repository's releases (GET /repos/<repo>/releases),
// caches the answer for ten minutes per visitor, and works out each file's
// platform from its name, so a release needs no particular naming beyond
// saying which system a file is for: "windows", "macos-arm64" / "macos-x64"
// (or "mac", "darwin", "arm64", "x64"), "linux", or an .apk for Android.
// Anything else in a release is listed under "Other files".
//
// The build (scripts/build.mjs) also writes a snapshot, assets/releases.json,
// fetched with a token so it does not count against anyone. The pages read it
// first, from the same origin, and only when it is more than 15 minutes old do
// they also ask GitHub directly, keeping the snapshot if that fails. GitHub
// allows 60 such requests an hour per visitor without a token; when neither
// the snapshot nor GitHub has a repository's releases, the page says so and
// links to them on GitHub instead of guessing.
window.DNP_RELEASES = (function () {
  const OWNER = 'projectdigidream'
  // the downloadable tools, from tools.md (assets/tools.js is written from it by the build)
  const TOOLS = (window.DNP_TOOLS || []).filter((t) => t.repo)
  const ENGINE_REPO = 'digidream-engine'
  const SNAPSHOT = new URL('releases.json', document.currentScript ? document.currentScript.src : location.href).href
  const PLATFORMS = {
    'windows-x64': { label: 'Windows', detail: '64-bit' },
    'macos-arm64': { label: 'macOS', detail: 'Apple silicon' },
    'macos-x64': { label: 'macOS', detail: 'Intel' },
    'macos': { label: 'macOS', detail: 'universal' },
    'linux-x64': { label: 'Linux', detail: '64-bit' },
    android: { label: 'Android', detail: 'APK, sideload' }
  }
  const repoOf = (tool) => OWNER + '/' + tool.repo
  const repoUrl = (tool) => 'https://github.com/' + repoOf(tool)
  const releasesUrl = (tool) => repoUrl(tool) + '/releases'
  const latestUrl = (tool) => repoUrl(tool) + '/releases/latest'
  const toolOf = (release) => TOOLS.find((t) => t.id === release._tool) || null
  const versionOf = (release) => release.tag_name.replace(/^[a-z]+-v|^v/i, '')

  // Which system a file is for, from its name alone. Checksums, signatures and
  // source archives are files too, but not downloads for a system.
  function platformOf (name) {
    const n = name.toLowerCase()
    if (/\.(sha256|sha512|sig|asc|txt|md|json)$/.test(n) || /source|src\.(zip|tar)/.test(n)) return null
    if (n.endsWith('.apk') || n.endsWith('.aab') || /android/.test(n)) return 'android'
    if (/mac|darwin|osx|\.dmg$/.test(n)) return /arm64|aarch64|apple|silicon/.test(n) ? 'macos-arm64' : /x64|x86_64|intel|amd64/.test(n) ? 'macos-x64' : 'macos'
    if (/(^|[^a-z])win(dows|64|32)?([^a-z]|$)|\.exe$|\.msi$/.test(n)) return 'windows-x64'
    if (/linux|\.appimage$|\.deb$|\.rpm$/.test(n)) return 'linux-x64'
    return null
  }
  // A variant is a second build of the same thing for the same system, such as
  // the studio without its plugins. The Download box never offers one first;
  // the downloads page names it beside the system.
  // Each says how the downloads page heads its files: the group's title, and a
  // line under it ("not recommended" is a judgement, so a variant opts into it).
  const VARIANTS = [
    { re: /no-?plugins/i, label: 'without plugins', group: 'Without plugins (not recommended)', note: 'The studio alone, with none of its plugins built in: ThreeSprite, qPainter, DigidreamSound, DigidreamSynth, Code, the Packager and GitHub sync.' },
    { re: /portable/i, label: 'portable', group: 'Portable', note: 'Runs from wherever you put it, without installing.' }
  ]
  const variantInfo = (name) => VARIANTS.find((v) => v.re.test(name)) || null
  const variantOf = (name) => { const v = variantInfo(name); return v ? v.label : null }
  const parse = (asset) => ({ platform: platformOf(asset.name), variant: variantOf(asset.name), variantInfo: variantInfo(asset.name) })

  function detect () {
    const ua = navigator.userAgent
    if (/Android/i.test(ua)) return 'android'
    if (/Windows/i.test(ua)) return 'windows-x64'
    if (/Mac OS X|Macintosh/i.test(ua)) return 'macos-arm64' // a browser cannot tell Apple silicon from Intel reliably; most new Macs are arm64
    if (/Linux/i.test(ua)) return 'linux-x64'
    return 'windows-x64'
  }
  // A release can carry several files for one system: an installer and an
  // archive (setup.exe and .zip, .dmg and .zip, .AppImage and .tar.gz). The
  // Download box offers one per system, the installer first; the downloads
  // page lists them all.
  const RANK = [/(setup|install)[^/]*\.exe$|\.msi$/, /\.exe$/, /\.dmg$/, /\.appimage$/, /\.apk$/, /\.deb$/, /\.(zip|tar\.gz|tgz|tar\.xz)$/]
  const rank = (name) => { const i = RANK.findIndex((re) => re.test(name.toLowerCase())); return i < 0 ? RANK.length : i }
  function onePerSystem (files) {
    const best = new Map()
    const score = (x) => (x.variant ? 100 : 0) + rank(x.a.name)
    for (const x of files) if (x.platform && (!best.has(x.platform) || score(x) < score(best.get(x.platform)))) best.set(x.platform, x)
    const order = ['windows-x64', 'macos-arm64', 'macos-x64', 'macos', 'linux-x64', 'android']
    return [...best.values()].sort((a, b) => order.indexOf(a.platform) - order.indexOf(b.platform))
  }
  // what kind of file it is, for the button: "installer", "disk image", ...
  function kindOf (name) {
    const n = name.toLowerCase()
    return /\.(exe|msi)$/.test(n) ? 'installer' : n.endsWith('.dmg') ? 'disk image' : n.endsWith('.appimage') ? 'AppImage' : n.endsWith('.apk') ? 'APK' : n.endsWith('.deb') ? '.deb' : 'archive'
  }
  // the file for this device: an exact match, else a universal macOS build
  function pickFor (files, mine) {
    return files.find((x) => x.platform === mine) ||
      (mine.startsWith('macos') ? files.find((x) => x.platform === 'macos') : null) || null
  }

  async function fetchRepo (repo) {
    const key = 'dnp-releases-v4:' + repo
    try {
      const c = JSON.parse(localStorage.getItem(key) || 'null')
      if (c && Date.now() - c.at < 10 * 60 * 1000) return c.releases
    } catch (e) {}
    const r = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=30`, { headers: { Accept: 'application/vnd.github+json' } })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const releases = (await r.json()).filter((x) => !x.draft)
    try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), releases })) } catch (e) {}
    return releases
  }

  async function snapshot () {
    try {
      const r = await fetch(SNAPSHOT, { cache: 'no-cache' })
      if (r.ok) return await r.json()
    } catch (e) {}
    return null
  }

  // every tool's releases, newest first, each stamped with its tool; plus which tools could not be read
  let loading = null
  // Two channels: a release whose tag is on main is stable; one only on dev is
  // nightly. The build decides (scripts/build.mjs, GitHub's compare API) and
  // records it in the snapshot as `channel`; a release the snapshot has not
  // seen yet counts as nightly until the next build says otherwise.
  // downloads.html?nightly shows every release; everywhere else, main's only.
  const NIGHTLY = /[?&]nightly\b/.test(location.search)
  function load () {
    if (loading) return loading
    loading = (async () => {
      const failed = new Set()
      const out = []
      const snap = await snapshot()
      const fresh = snap && Date.now() - Date.parse(snap.at) < 15 * 60 * 1000
      await Promise.all(TOOLS.map(async (t) => {
        const kept = snap && snap.repos && snap.repos[repoOf(t)]
        let list = fresh && kept ? kept : null
        if (!list) { try { list = await fetchRepo(repoOf(t)) } catch (e) { list = kept || null } }
        if (!list) { failed.add(t.id); return }
        const known = new Map((kept || []).map((x) => [x.tag_name, x.channel]))
        for (const rel of list) {
          const channel = rel.channel || known.get(rel.tag_name) || 'dev'
          if (NIGHTLY || channel === 'main') out.push({ ...rel, channel, _tool: t.id })
        }
      }))
      out.sort((x, y) => (y.published_at || '').localeCompare(x.published_at || ''))
      const why = failed.size === 0 ? 'From GitHub Releases'
        : failed.size === TOOLS.length ? 'GitHub could not be reached; the links go to GitHub instead'
        : `From GitHub Releases; ${failed.size} repositor${failed.size === 1 ? 'y' : 'ies'} could not be read`
      return { releases: out, failed, why }
    })()
    return loading
  }
  const releasesOf = (releases, tool) => releases.filter((r) => r._tool === tool)
  const latestOf = (releases, tool) => { const rs = releasesOf(releases, tool); return rs.find((r) => !r.prerelease) || rs[0] || null }
  const filesOf = (release) => release.assets.map((a) => ({ a, ...parse(a) }))
  const MB = 1024 * 1024
  const size = (b) => b >= MB * 10 ? Math.round(b / MB) + ' MB' : b >= MB ? (b / MB).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'
  const date = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  return { NIGHTLY, onePerSystem, kindOf, OWNER, TOOLS, ENGINE_REPO, PLATFORMS, repoOf, repoUrl, releasesUrl, latestUrl, toolOf, versionOf, platformOf, parse, detect, pickFor, load, releasesOf, latestOf, filesOf, size, date }
})()
