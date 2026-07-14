import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import { Button, Eyebrow } from '../components/ui.jsx'
import { readJsonResponse, describeFailure, formatMB, inputCls, inputClsXs } from './admin/api.js'

const STORAGE_KEY = 'crosspoint-admin-secret'

// --- Small shared bits -------------------------------------------------

function Card({ children, className = '' }) {
  return (
    <div className={`rounded-2xl bg-white p-5 ring-1 ring-stone-950/5 ${className}`}>
      {children}
    </div>
  )
}

function CardTitle({ children }) {
  return (
    <h2 className="font-display text-sm font-semibold tracking-tight text-stone-900">{children}</h2>
  )
}

function RefreshIcon() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
      />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z"
      />
    </svg>
  )
}

function XIcon() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

// --- Current build status ----------------------------------------------

function BuildStatusCard({ log, refreshRef }) {
  // status: { kind: 'loading' | 'none' | 'error' | 'ok', meta }
  const [status, setStatus] = useState({ kind: 'loading' })

  const refreshStatus = useCallback(async () => {
    setStatus({ kind: 'loading' })
    try {
      const res = await fetch('/api/build/latest')
      if (!res.ok) {
        setStatus({ kind: 'none' })
        return
      }
      const meta = await res.json()
      setStatus({ kind: 'ok', meta })
      log(`Status refreshed: ${meta.status} @ ${meta.commitShort || '?'}`)
    } catch {
      setStatus({ kind: 'error' })
    }
  }, [log])

  useEffect(() => {
    refreshRef.current = refreshStatus
    refreshStatus()
  }, [refreshStatus, refreshRef])

  const statusColors = {
    success: 'bg-brand-500',
    building: 'bg-amber-500 animate-pulse',
    failed: 'bg-red-500',
  }

  let body
  if (status.kind === 'loading') {
    body = <span className="text-stone-400">Loading...</span>
  } else if (status.kind === 'none') {
    body = <span className="text-stone-400">No builds yet</span>
  } else if (status.kind === 'error') {
    body = <span className="text-red-500">Failed to load</span>
  } else {
    const meta = status.meta
    const date = meta.buildDate ? new Date(meta.buildDate).toLocaleString() : '-'
    const dotClass = statusColors[meta.status] || 'bg-stone-400'
    body = (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className={`size-2 rounded-full ${dotClass}`} />
          <span className="font-medium text-stone-700">{meta.status}</span>
          <span className="text-stone-300">|</span>
          <span className="font-mono tabular-nums">{meta.commitShort || '-'}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-stone-400">Version:</span>{' '}
            <span className="text-stone-700">{meta.version || '-'}</span>
          </div>
          <div>
            <span className="text-stone-400">Built:</span>{' '}
            <span className="text-stone-700 tabular-nums">{date}</span>
          </div>
          <div>
            <span className="text-stone-400">Size:</span>{' '}
            <span className="text-stone-700">
              {meta.firmwareSize ? formatMB(meta.firmwareSize) + ' MB' : '-'}
            </span>
          </div>
          <div>
            <span className="text-stone-400">Changelog:</span>{' '}
            <span className="text-stone-700">{meta.changelog?.length || 0} commits</span>
          </div>
        </div>
        {meta.error ? (
          <div className="mt-1 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{meta.error}</div>
        ) : null}
      </div>
    )
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Current Build</CardTitle>
        <button
          type="button"
          onClick={refreshStatus}
          className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
          title="Refresh"
        >
          <RefreshIcon />
        </button>
      </div>
      <div className="mt-3 text-sm text-stone-400">{body}</div>
    </Card>
  )
}

// --- Trigger build -------------------------------------------------------

function TriggerBuildCard({ secret, log, refreshRef }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null) // { kind: 'pending' | 'ok' | 'error', text }

  async function triggerBuild() {
    setBusy(true)
    setResult({ kind: 'pending', text: 'Triggering build...' })

    try {
      const res = await fetch('/api/build/trigger', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}` },
      })
      const data = await res.json()

      if (res.ok) {
        setResult({ kind: 'ok', text: data.commit })
        log(`Build triggered: ${data.commit}`)
        // Refresh status after a short delay
        setTimeout(() => refreshRef.current?.(), 3000)
      } else {
        setResult({ kind: 'error', text: data.error })
        log(`Trigger failed: ${data.error}`)
      }
    } catch {
      setResult({ kind: 'error', text: 'Connection error' })
    }

    setBusy(false)
  }

  return (
    <Card>
      <CardTitle>Trigger Build</CardTitle>
      <p className="mt-1 text-xs text-stone-400">
        Fetches the latest commit from master and starts a build if it's new.
      </p>
      <Button as="button" variant="primary" className="mt-3 w-full" onClick={triggerBuild} disabled={busy}>
        Fetch &amp; Build
      </Button>
      <div className="mt-2">
        {result?.kind === 'pending' && <p className="text-sm text-stone-400">{result.text}</p>}
        {result?.kind === 'ok' && (
          <div className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
            Build triggered for commit <span className="font-mono">{result.text}</span>
          </div>
        )}
        {result?.kind === 'error' && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{result.text}</div>
        )}
      </div>
    </Card>
  )
}

// --- Site banner ----------------------------------------------------------

function BannerCard({ secret, log }) {
  const [text, setText] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null) // { ok, text }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/banner')
        if (!res.ok) return
        const banner = await res.json()
        if (cancelled) return
        setText(banner.text || '')
        setEnabled(!!banner.enabled)
      } catch {
        log('Failed to load banner')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [log])

  async function saveBanner() {
    setBusy(true)
    setResult(null)

    try {
      const res = await fetch('/api/banner', {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer ' + secret,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enabled, text }),
      })
      if (res.ok) {
        setResult({ ok: true, text: 'Saved' })
        log('Banner saved (' + (enabled ? 'shown' : 'hidden') + ')')
      } else {
        const data = await res.json().catch(() => ({}))
        setResult({ ok: false, text: data.error || 'Save failed' })
      }
    } catch {
      setResult({ ok: false, text: 'Connection error' })
    }

    setBusy(false)
  }

  return (
    <Card>
      <CardTitle>Site Banner</CardTitle>
      <p className="mt-1 text-xs text-stone-400">
        The colored bar at the top of the homepage. Supports markdown:{' '}
        <code className="font-mono">**bold**</code>, <code className="font-mono">*italic*</code>,{' '}
        <code className="font-mono">[text](url)</code>, <code className="font-mono">`code`</code>, and
        bare URLs.
      </p>

      <div className="mt-3 space-y-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Banner text (e.g. New: CrossPoint beta released. Update via https://crosspoint.tools/#flash-tools)"
          rows={3}
          className={`${inputCls} resize-none`}
        />
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="size-4 rounded border-stone-300 text-brand-500 focus:ring-brand-500/20"
          />
          Show banner on homepage
        </label>
        <Button as="button" variant="primary" className="w-full" onClick={saveBanner} disabled={busy}>
          Save banner
        </Button>
        {result && (
          <p className={`text-xs ${result.ok ? 'text-brand-600' : 'text-red-600'}`}>{result.text}</p>
        )}
      </div>
    </Card>
  )
}

// --- Beta testing ----------------------------------------------------------

function BetaCard({ secret, log }) {
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [mode, setMode] = useState('upload') // 'upload' | 'release'
  const [file, setFile] = useState(null)
  const [releaseTag, setReleaseTag] = useState('')
  const [releaseRepo, setReleaseRepo] = useState('')
  const [busy, setBusy] = useState(false)
  const [builds, setBuilds] = useState([])
  // Per-build edit panels: { [id]: { name, notes, tag, repo } }
  const [edits, setEdits] = useState({})
  const fileInputRef = useRef(null)

  const loadBetaList = useCallback(async () => {
    try {
      const res = await fetch('/api/beta')
      const data = await res.json()
      setBuilds(data.builds || [])
    } catch {
      // ignore, matches original behavior
    }
  }, [])

  useEffect(() => {
    loadBetaList()
  }, [loadBetaList])

  const hasName = !!name.trim()
  const uploadDisabled = busy || !file || !hasName
  const releaseDisabled = busy || !releaseTag.trim() || !hasName

  async function uploadBeta() {
    const trimmedName = name.trim()
    if (!trimmedName) return

    const isRelease = mode === 'release'
    const tag = releaseTag.trim()
    const repo = releaseRepo.trim()

    if (isRelease) {
      if (!tag) return
    } else if (!file) {
      return
    }

    setBusy(true)

    try {
      const formData = new FormData()
      formData.append('name', trimmedName)
      formData.append('notes', notes.trim())
      if (isRelease) {
        formData.append('releaseTag', tag)
        if (repo) formData.append('releaseRepo', repo)
      } else {
        formData.append('firmware', file)
      }

      const res = await fetch('/api/beta', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + secret },
        body: formData,
      })
      const data = await res.json()

      if (res.ok) {
        log(
          'Beta build created: ' +
            data.build.name +
            (data.build.source && data.build.source.type === 'github-release'
              ? ' (release ' + data.build.source.tag + ')'
              : '')
        )
        setName('')
        setNotes('')
        setFile(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
        setReleaseTag('')
        loadBetaList()
      } else {
        log('Beta create failed: ' + data.error)
      }
    } catch (err) {
      log('Beta create error: ' + err.message)
    }

    setBusy(false)
  }

  async function deleteBeta(id, buildName) {
    if (!window.confirm('Delete beta build "' + buildName + '"?')) return

    try {
      const res = await fetch('/api/beta/' + id, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + secret },
      })
      if (res.ok) {
        log('Deleted beta build: ' + buildName)
        loadBetaList()
      }
    } catch (err) {
      log('Delete failed: ' + err.message)
    }
  }

  function toggleEdit(b) {
    setEdits((prev) => {
      const next = { ...prev }
      if (next[b.id]) {
        delete next[b.id]
      } else {
        // Don't pre-fill the tag; leaving it blank means "keep current binary".
        // Pre-filling would force a re-fetch on every save.
        next[b.id] = { name: b.name, notes: b.notes || '', tag: '', repo: '' }
      }
      return next
    })
  }

  function setEditField(id, field, value) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  async function saveBetaEdit(id) {
    const edit = edits[id]
    if (!edit) return
    const editName = edit.name.trim()
    const editNotes = edit.notes.trim()
    const tag = edit.tag.trim()
    const repo = edit.repo.trim()
    if (!editName) return

    const body = { name: editName, notes: editNotes }
    if (tag) {
      body.releaseTag = tag
      if (repo) body.releaseRepo = repo
    }

    try {
      const res = await fetch('/api/beta/' + id, {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer ' + secret,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        log('Updated beta build: ' + editName + (tag ? ' (linked to ' + tag + ')' : ''))
        setEdits((prev) => {
          const next = { ...prev }
          delete next[id]
          return next
        })
        loadBetaList()
      } else {
        const data = await res.json()
        log('Update failed: ' + data.error)
      }
    } catch (err) {
      log('Update error: ' + err.message)
    }
  }

  const modeBtnBase = 'flex-1 rounded-md px-3 py-1.5'
  const modeActive = 'bg-white shadow-sm text-stone-900'
  const modeInactive = 'text-stone-600'

  return (
    <Card>
      <CardTitle>Beta Testing</CardTitle>
      <p className="mt-1 text-xs text-stone-400">
        Upload a .bin or point at a GitHub release to expose it as a firmware option on the main page.
      </p>

      <div className="mt-3 space-y-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Build name (e.g. KOSync Fix)"
          className={inputCls}
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Test notes. Supports markdown: **bold**, *italic*, [text](url), `code`"
          rows={3}
          className={`${inputCls} resize-none`}
        />

        <div className="flex gap-1 rounded-lg bg-stone-100 p-1 font-mono text-xs font-medium">
          <button
            type="button"
            onClick={() => setMode('upload')}
            className={`${modeBtnBase} ${mode === 'upload' ? modeActive : modeInactive}`}
          >
            Upload .bin
          </button>
          <button
            type="button"
            onClick={() => setMode('release')}
            className={`${modeBtnBase} ${mode === 'release' ? modeActive : modeInactive}`}
          >
            GitHub Release
          </button>
        </div>

        {mode === 'upload' ? (
          <div className="flex gap-2">
            <label className="flex flex-1 cursor-pointer items-center justify-center rounded-lg border border-dashed border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-500 hover:border-stone-400 hover:text-stone-700">
              <span className="truncate">{file ? file.name : 'Choose .bin file...'}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".bin"
                className="hidden"
                onChange={(e) => setFile(e.target.files[0] || null)}
              />
            </label>
            <Button
              as="button"
              variant="primary"
              className="shrink-0"
              onClick={uploadBeta}
              disabled={uploadDisabled}
            >
              {busy && mode === 'upload' ? 'Uploading...' : 'Upload'}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              value={releaseTag}
              onChange={(e) => setReleaseTag(e.target.value)}
              placeholder="Release tag (e.g. sd-fonts-v1.0)"
              className={inputCls}
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={releaseRepo}
                onChange={(e) => setReleaseRepo(e.target.value)}
                placeholder="crosspoint-reader/crosspoint-reader"
                className={`${inputCls} flex-1 text-xs text-stone-700`}
              />
              <Button
                as="button"
                variant="primary"
                className="shrink-0"
                onClick={uploadBeta}
                disabled={releaseDisabled}
              >
                {busy && mode === 'release' ? 'Pulling...' : 'Pull from release'}
              </Button>
            </div>
            <p className="text-xs text-stone-400">
              Pulls <code className="rounded bg-stone-100 px-1 py-0.5 font-mono">firmware.bin</code>{' '}
              from that tag. Repo defaults to{' '}
              <code className="rounded bg-stone-100 px-1 py-0.5 font-mono">
                crosspoint-reader/crosspoint-reader
              </code>
              .
            </p>
          </div>
        )}
      </div>

      {builds.length > 0 && (
        <div className="mt-4 divide-y divide-stone-100">
          {builds.map((b) => {
            const size = formatMB(b.firmwareSize)
            const date = new Date(b.createdAt).toLocaleDateString()
            const src = b.source && b.source.type === 'github-release' ? b.source : null
            const currentTag = src ? src.tag : ''
            const currentRepo = src ? src.owner + '/' + src.repo : ''
            const edit = edits[b.id]
            return (
              <div key={b.id} className="py-2.5">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-stone-700">{b.name}</div>
                    <div className="text-xs text-stone-400">
                      {size} MB &middot; {date}
                      {src && (
                        <>
                          {' '}
                          &middot; <span className="text-brand-600">release {src.tag}</span>
                        </>
                      )}
                      {b.notes && (
                        <>
                          {' '}
                          &middot;{' '}
                          <span className="text-stone-500" title={b.notes}>
                            has notes
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="ml-2 flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      onClick={() => toggleEdit(b)}
                      className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
                      title="Edit"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteBeta(b.id, b.name)}
                      className="rounded-md p-1 text-stone-400 hover:bg-red-50 hover:text-red-600"
                      title="Delete"
                    >
                      <XIcon />
                    </button>
                  </div>
                </div>
                {edit && (
                  <div className="mt-2 space-y-2">
                    <input
                      type="text"
                      value={edit.name}
                      onChange={(e) => setEditField(b.id, 'name', e.target.value)}
                      className={inputCls}
                    />
                    <textarea
                      value={edit.notes}
                      onChange={(e) => setEditField(b.id, 'notes', e.target.value)}
                      rows={2}
                      className={`${inputCls} resize-none`}
                    />
                    <div className="space-y-1.5 rounded-md border border-stone-200 p-2">
                      <div className="text-xs font-medium text-stone-500">
                        Re-link to GitHub release (optional)
                      </div>
                      <input
                        type="text"
                        value={edit.tag}
                        onChange={(e) => setEditField(b.id, 'tag', e.target.value)}
                        placeholder={currentTag ? 'Currently: ' + currentTag : 'Release tag'}
                        className={inputClsXs}
                      />
                      <input
                        type="text"
                        value={edit.repo}
                        onChange={(e) => setEditField(b.id, 'repo', e.target.value)}
                        placeholder={currentRepo || 'crosspoint-reader/crosspoint-reader'}
                        className={`${inputClsXs} text-stone-700`}
                      />
                      <p className="text-xs text-stone-400">
                        Setting a tag refetches firmware.bin and replaces the stored binary.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => saveBetaEdit(b.id)}
                        className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleEdit(b)}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-stone-500 hover:text-stone-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {builds.length === 0 && <p className="mt-3 text-xs text-stone-400">No beta builds</p>}
    </Card>
  )
}

// --- Sticky beta -------------------------------------------------------------

function StickyCard({ secret, log }) {
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [build, setBuild] = useState(null)
  const [edit, setEdit] = useState(null) // { name, notes } when panel open
  const fileInputRef = useRef(null)

  const loadStickyInfo = useCallback(async () => {
    try {
      const res = await fetch('/api/sticky/info')
      const data = await res.json()
      setBuild(data.build || null)
    } catch {
      // ignore, matches original behavior
    }
  }, [])

  useEffect(() => {
    loadStickyInfo()
  }, [loadStickyInfo])

  async function uploadSticky() {
    const trimmedName = name.trim()
    if (!trimmedName || !file) return

    setBusy(true)

    try {
      const formData = new FormData()
      formData.append('name', trimmedName)
      formData.append('notes', notes.trim())
      formData.append('firmware', file)

      const res = await fetch('/api/sticky/upload', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + secret },
        body: formData,
      })
      const r = await readJsonResponse(res)

      if (r.ok) {
        log('Sticky build uploaded: ' + r.data.build.name)
        setName('')
        setNotes('')
        setFile(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
        loadStickyInfo()
      } else {
        log('Sticky upload failed: ' + describeFailure(r))
      }
    } catch (err) {
      log('Sticky upload error: ' + err.message)
    }

    setBusy(false)
  }

  function toggleEditSticky() {
    if (!build) return
    setEdit((prev) => (prev ? null : { name: build.name, notes: build.notes || '' }))
  }

  async function saveStickyEdit() {
    if (!edit) return
    const editName = edit.name.trim()
    const editNotes = edit.notes.trim()
    if (!editName) return

    try {
      const res = await fetch('/api/sticky', {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer ' + secret,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: editName, notes: editNotes }),
      })
      const r = await readJsonResponse(res)
      if (r.ok) {
        log('Sticky build updated: ' + r.data.build.name)
        setEdit(null)
        loadStickyInfo()
      } else {
        log('Sticky update failed: ' + describeFailure(r))
      }
    } catch (err) {
      log('Sticky update error: ' + err.message)
    }
  }

  async function deleteSticky() {
    if (!build) return
    if (!window.confirm('Delete Sticky build "' + build.name + '"?')) return

    try {
      const res = await fetch('/api/sticky', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + secret },
      })
      const r = await readJsonResponse(res)
      if (r.ok) {
        log('Deleted Sticky build: ' + build.name)
        loadStickyInfo()
      } else {
        log('Sticky delete failed: ' + describeFailure(r))
      }
    } catch (err) {
      log('Sticky delete error: ' + err.message)
    }
  }

  const uploadDisabled = busy || !file || !name.trim()

  return (
    <Card>
      <CardTitle>Sticky Beta</CardTitle>
      <p className="mt-1 text-xs text-stone-400">
        Upload the ESP32-S3 build served on the hidden{' '}
        <Link to="/sticky" className="font-medium text-brand-500 underline underline-offset-2">
          /sticky
        </Link>{' '}
        page. Uploading replaces the current build.
      </p>

      <div className="mt-3 space-y-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Build name (e.g. Sticky Beta v1)"
          className={inputCls}
        />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Test notes. Supports markdown: **bold**, *italic*, [text](url), `code`"
          rows={3}
          className={`${inputCls} resize-none`}
        />
        <div className="flex gap-2">
          <label className="flex flex-1 cursor-pointer items-center justify-center rounded-lg border border-dashed border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-500 hover:border-stone-400 hover:text-stone-700">
            <span className="truncate">{file ? file.name : 'Choose .bin file...'}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".bin"
              className="hidden"
              onChange={(e) => setFile(e.target.files[0] || null)}
            />
          </label>
          <Button
            as="button"
            variant="primary"
            className="shrink-0"
            onClick={uploadSticky}
            disabled={uploadDisabled}
          >
            {busy ? 'Uploading...' : 'Upload'}
          </Button>
        </div>
      </div>

      {build ? (
        <div className="mt-4 border-t border-stone-100 pt-2.5">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-stone-700">{build.name}</div>
              <div className="text-xs text-stone-400">
                {formatMB(build.firmwareSize)} MB &middot;{' '}
                {new Date(build.uploadedAt).toLocaleDateString()}
                {build.notes && (
                  <>
                    {' '}
                    &middot;{' '}
                    <span className="text-stone-500" title={build.notes}>
                      has notes
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="ml-2 flex shrink-0 gap-0.5">
              <button
                type="button"
                onClick={toggleEditSticky}
                className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
                title="Edit"
              >
                <PencilIcon />
              </button>
              <button
                type="button"
                onClick={deleteSticky}
                className="rounded-md p-1 text-stone-400 hover:bg-red-50 hover:text-red-600"
                title="Delete"
              >
                <XIcon />
              </button>
            </div>
          </div>
          {edit && (
            <div className="mt-2 space-y-2">
              <input
                type="text"
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                className={inputCls}
              />
              <textarea
                value={edit.notes}
                onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                rows={2}
                className={`${inputCls} resize-none`}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveStickyEdit}
                  className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-600"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEdit(null)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-stone-500 hover:text-stone-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-stone-400">No Sticky build uploaded</p>
      )}
    </Card>
  )
}

// --- Activity log -------------------------------------------------------------

function LogCard({ entries }) {
  return (
    <Card>
      <CardTitle>Activity Log</CardTitle>
      <div className="mt-3 max-h-48 space-y-1 overflow-y-auto font-mono text-xs text-stone-500">
        {entries.map((entry, i) => (
          <div key={entries.length - i}>
            <span className="text-stone-300">{entry.time}</span> {entry.msg}
          </div>
        ))}
      </div>
    </Card>
  )
}

// --- Page ----------------------------------------------------------------------

export default function AdminPage() {
  const [secret, setSecret] = useState('')
  const [authed, setAuthed] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState('')
  const [entries, setEntries] = useState([])
  const secretInputRef = useRef(null)
  // BuildStatusCard registers its refresh function here so the trigger card
  // (and auth flow) can call it, mirroring the original page's refreshStatus().
  const refreshRef = useRef(null)

  const log = useCallback((msg) => {
    const now = new Date().toLocaleTimeString()
    setEntries((prev) => [{ time: now, msg }, ...prev])
  }, [])

  // Restore session
  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY)
    if (saved) {
      setSecret(saved)
      setAuthed(true)
    }
  }, [])

  async function authenticate() {
    const value = (secretInputRef.current?.value || '').trim()
    if (!value) return

    setAuthBusy(true)
    setAuthError('')

    // Test the secret by hitting the build trigger endpoint; a 401 means the
    // secret is wrong. Auth success triggers a build as a side effect (that's ok).
    try {
      const res = await fetch('/api/build/trigger', {
        method: 'POST',
        headers: { Authorization: `Bearer ${value}` },
      })

      if (res.status === 401) {
        setAuthError('Invalid secret')
        setAuthBusy(false)
        return
      }

      const data = await res.json()
      setSecret(value)
      setAuthed(true)
      log(`Authenticated. Build triggered: ${data.commit || 'unknown'}`)

      // Save to session. Cards load their own data (status, beta list,
      // sticky info, banner) when the dashboard mounts.
      sessionStorage.setItem(STORAGE_KEY, value)
    } catch {
      setAuthError('Connection error')
      setAuthBusy(false)
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-md px-6 py-16">
        <div className="text-center">
          <img src="/logo.png" alt="" className="mx-auto size-10 rounded-lg" />
          <Eyebrow className="mt-6 justify-center">Build management</Eyebrow>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-stone-900">
            Admin
          </h1>
          <p className="mt-1 text-sm text-stone-600">CrossPoint Tools build management</p>
        </div>

        {!authed ? (
          <div className="mt-8 rounded-2xl bg-white p-6 ring-1 ring-stone-950/5">
            <label htmlFor="secret-input" className="text-sm font-medium text-stone-700">
              Secret
            </label>
            <input
              ref={secretInputRef}
              type="password"
              id="secret-input"
              placeholder="Enter admin secret"
              autoComplete="off"
              className={`mt-1.5 ${inputCls}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') authenticate()
              }}
            />
            <Button
              as="button"
              variant="primary"
              className="mt-3 w-full"
              onClick={authenticate}
              disabled={authBusy}
            >
              Unlock
            </Button>
            {authError && <p className="mt-2 text-sm text-red-600">{authError}</p>}
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            <BuildStatusCard log={log} refreshRef={refreshRef} />
            <TriggerBuildCard secret={secret} log={log} refreshRef={refreshRef} />
            <BannerCard secret={secret} log={log} />
            <BetaCard secret={secret} log={log} />
            <StickyCard secret={secret} log={log} />
            <LogCard entries={entries} />
          </div>
        )}
      </div>
    </Layout>
  )
}
