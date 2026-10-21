// The Feedback window: post without an account, read everyone's, with the
// replies written in Supabase (supabase/feedback.sql sets the table up).
//
// The anon key is meant to be public: what it may do is limited by the
// table's row-level security, not by keeping it secret.
;(function () {
  const SUPABASE_URL = '' // e.g. 'https://abcdefgh.supabase.co'
  const ANON_KEY = ''
  const $ = (id) => document.getElementById(id)
  const form = $('fb-form')
  if (!form) return
  const status = $('fb-status')
  const list = $('fb-list')
  const api = (q, init = {}) => fetch(SUPABASE_URL + '/rest/v1/feedback' + q, {
    ...init, headers: { apikey: ANON_KEY, Authorization: 'Bearer ' + ANON_KEY, 'Content-Type': 'application/json', ...init.headers }
  })
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e }
  const when = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

  if (!SUPABASE_URL || !ANON_KEY) {
    status.textContent = 'Feedback is not connected yet.'
    form.querySelector('button').disabled = true
    return
  }

  async function show () {
    try {
      const r = await api('?select=id,created_at,name,message,reply,replied_at&order=created_at.desc&limit=50')
      if (!r.ok) throw new Error(r.status)
      const rows = await r.json()
      list.replaceChildren()
      if (!rows.length) list.append(el('p', 'fb-empty', 'No feedback yet. Be the first.'))
      for (const f of rows) {
        const item = el('div', 'fb-item')
        item.append(el('div', 'fb-head', `${f.name || 'Anonymous'} · ${when(f.created_at)}`), el('p', 'fb-msg', f.message))
        if (f.reply) {
          const re = el('div', 'fb-reply')
          re.append(el('div', 'fb-head', 'Reply from Digidream' + (f.replied_at ? ' · ' + when(f.replied_at) : '')), el('p', 'fb-msg', f.reply))
          item.append(re)
        }
        list.append(item)
      }
      $('fb-count').textContent = rows.length + ' message(s)'
    } catch (e) { list.replaceChildren(el('p', 'fb-empty', 'Could not load the feedback just now.')) }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (form.website.value) return // the hidden field only bots fill in
    const message = form.message.value.trim()
    if (message.length < 3) { status.textContent = 'Write a little more first.'; return }
    const btn = form.querySelector('button'); btn.disabled = true; status.textContent = 'Sending…'
    try {
      const r = await api('', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ name: form.fbname.value.trim() || null, message }) })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || 'HTTP ' + r.status)
      form.message.value = ''
      status.textContent = 'Thank you! Your message is below.'
      show()
    } catch (err) { status.textContent = 'Not sent: ' + err.message }
    btn.disabled = false
  })
  show()
})()
