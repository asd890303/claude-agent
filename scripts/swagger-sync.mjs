#!/usr/bin/env node
/* eslint-disable no-undef */
/**
 * 下載 Swagger/OpenAPI JSON 並拆分為本地快取：
 *   docs/swagger/{site}/openapi.json  原始規格（jq 備援用）
 *   docs/swagger/{site}/INDEX.md      endpoint 索引（一行一筆，指向 domain 檔）
 *   docs/swagger/{site}/paths/{tag}.md 依 tag 分組的詳細 request/response schema
 *
 * 用法：
 *   node scripts/swagger-sync.mjs --site admin --url <backend-api.json 的 URL>
 *   node scripts/swagger-sync.mjs --site merchant --url <merchant-api.json 的 URL>
 *   node scripts/swagger-sync.mjs --site merchant-groups --url <merchant-groups-api.json 的 URL>
 *
 * URL 不寫死於此檔（內網位址不進程式碼），由呼叫端自 CLAUDE.md「Swagger API」表帶入。
 */
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
function getArg(name) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}

const site = getArg('site')
const url = getArg('url')
if (!site || !url) {
  console.error('用法: node scripts/swagger-sync.mjs --site <admin|merchant|merchant-groups> --url <swagger json url>')
  process.exit(1)
}

const outDir = path.join(process.cwd(), 'docs', 'swagger', site)
const pathsDir = path.join(outDir, 'paths')

// ---------- 下載 ----------
async function fetchSpec(specUrl) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const res = await fetch(specUrl, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

// ---------- $ref 解析（同時支援 Swagger 2 與 OpenAPI 3） ----------
function resolveRef(spec, ref) {
  const parts = ref.replace(/^#\//, '').split('/')
  let node = spec
  for (const p of parts) node = node?.[p]
  return node
}

function refName(ref) {
  return ref.split('/').pop()
}

// ---------- schema 轉精簡文字 ----------
function renderSchema(spec, schema, indent = 0, seen = new Set()) {
  if (!schema) return 'unknown'
  const pad = '  '.repeat(indent)
  const childPad = '  '.repeat(indent + 1)

  if (schema.$ref) {
    const name = refName(schema.$ref)
    if (seen.has(name)) return `<${name}>（循環參照）`
    const resolved = resolveRef(spec, schema.$ref)
    if (!resolved) return `<${name}>（未定義）`
    return renderSchema(spec, resolved, indent, new Set([...seen, name]))
  }
  if (schema.allOf) {
    const merged = { type: 'object', properties: {}, required: [] }
    for (const part of schema.allOf) {
      const r = part.$ref ? resolveRef(spec, part.$ref) : part
      Object.assign(merged.properties, r?.properties ?? {})
      merged.required.push(...(r?.required ?? []))
    }
    return renderSchema(spec, merged, indent, seen)
  }
  if (schema.enum) {
    return `${schema.type ?? 'string'} enum: ${schema.enum.join(' | ')}`
  }
  if (schema.type === 'array') {
    return `Array<${renderSchema(spec, schema.items, indent, seen)}>`
  }
  if (schema.type === 'object' || schema.properties) {
    const props = schema.properties ?? {}
    const required = new Set(schema.required ?? [])
    const keys = Object.keys(props)
    if (keys.length === 0) return 'object'
    const lines = keys.map((key) => {
      const prop = props[key]
      const opt = required.has(key) ? '' : '?'
      const desc = prop.description ? `  // ${String(prop.description).replace(/\s+/g, ' ')}` : ''
      return `${childPad}${key}${opt}: ${renderSchema(spec, prop, indent + 1, seen)}${desc}`
    })
    return `{\n${lines.join('\n')}\n${pad}}`
  }
  let base = schema.type ?? 'unknown'
  if (schema.format) base += `(${schema.format})`
  return base
}

// ---------- operation 轉 markdown ----------
function renderOperation(spec, method, apiPath, op) {
  const lines = []
  lines.push(`### ${method.toUpperCase()} ${apiPath}`)
  if (op.summary || op.description) {
    lines.push('')
    lines.push((op.summary || op.description).trim())
  }

  const params = op.parameters ?? []
  const queryOrPath = params.filter((p) => p.in === 'query' || p.in === 'path')
  if (queryOrPath.length > 0) {
    lines.push('', '**Params**')
    for (const p of queryOrPath) {
      const type = p.schema ? renderSchema(spec, p.schema, 0) : (p.type ?? 'string')
      lines.push(
        `- \`${p.name}\` (${p.in}, ${type}${p.required ? ', required' : ''})${p.description ? ` — ${p.description}` : ''}`,
      )
    }
  }

  // request body：Swagger 2 為 in:body 參數，OpenAPI 3 為 requestBody
  const bodyParam = params.find((p) => p.in === 'body')
  const bodySchema = bodyParam?.schema ?? op.requestBody?.content?.['application/json']?.schema
  if (bodySchema) {
    lines.push('', '**Request Body**', '', '```', renderSchema(spec, bodySchema), '```')
  }

  const res200 = op.responses?.['200'] ?? op.responses?.['201'] ?? op.responses?.default
  const resSchema = res200?.schema ?? res200?.content?.['application/json']?.schema
  if (resSchema) {
    lines.push('', '**Response 200**', '', '```', renderSchema(spec, resSchema), '```')
  }

  lines.push('')
  return lines.join('\n')
}

function tagOf(apiPath, op) {
  if (op.tags?.length) return op.tags[0]
  return pathSegment(apiPath) || 'misc'
}

// 取版本號（v1、v2…）之後的第一個路徑段，如 /admin/api/v1/account/... → account
function pathSegment(apiPath) {
  const segs = apiPath.split('/').filter(Boolean)
  const vIdx = segs.findIndex((s) => /^v\d+$/.test(s))
  return vIdx >= 0 ? segs[vIdx + 1] : segs[0]
}

// 檔名一律英文 kebab-case；tag 含非 ASCII（如中文）時改用路徑段
function safeFileName(tag, apiPath) {
  const ascii = tag
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  if (ascii) return ascii
  const seg = (pathSegment(apiPath) ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return seg || 'misc'
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete']

async function main() {
  console.log(`[${site}] 下載 ${url} ...`)
  const spec = await fetchSpec(url)

  const oldIndex = existsSync(path.join(outDir, 'INDEX.md'))
    ? await readFile(path.join(outDir, 'INDEX.md'), 'utf8')
    : ''
  const oldEndpoints = new Set(
    oldIndex
      .split('\n')
      .filter((l) => l.startsWith('| `'))
      .map((l) => l.split('|')[1].trim()),
  )

  // 依 tag 分組
  const groups = new Map()
  const indexRows = []
  for (const [apiPath, methods] of Object.entries(spec.paths ?? {})) {
    for (const method of HTTP_METHODS) {
      const op = methods[method]
      if (!op) continue
      const tag = tagOf(apiPath, op)
      const file = safeFileName(tag, apiPath)
      if (!groups.has(file)) groups.set(file, { tag, ops: [] })
      groups.get(file).ops.push({ method, apiPath, op })
      indexRows.push({
        key: `\`${method.toUpperCase()} ${apiPath}\``,
        summary: (op.summary || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim(),
        file: `paths/${file}.md`,
      })
    }
  }

  await rm(pathsDir, { recursive: true, force: true })
  await mkdir(pathsDir, { recursive: true })

  await writeFile(path.join(outDir, 'openapi.json'), JSON.stringify(spec, null, 2))

  for (const [file, { tag, ops }] of groups) {
    ops.sort((a, b) => a.apiPath.localeCompare(b.apiPath) || a.method.localeCompare(b.method))
    const body = [`# ${tag}`, '', ...ops.map(({ method, apiPath, op }) => renderOperation(spec, method, apiPath, op))]
    await writeFile(path.join(pathsDir, `${file}.md`), body.join('\n'))
  }

  indexRows.sort((a, b) => a.key.localeCompare(b.key))
  const title = spec.info?.title ?? site
  const version = spec.info?.version ?? ''
  const indexMd = [
    `# ${title} ${version}`.trim(),
    '',
    `> 由 /swagger-sync 產生，來源見 CLAUDE.md「Swagger API」節。共 ${indexRows.length} 個 endpoint。`,
    '> 查欄位細節時依「詳細」欄開啟對應檔案，不要整份讀 openapi.json。',
    '',
    '| Endpoint | 摘要 | 詳細 |',
    '| -------- | ---- | ---- |',
    ...indexRows.map((r) => `| ${r.key} | ${r.summary} | ${r.file} |`),
    '',
  ].join('\n')
  await writeFile(path.join(outDir, 'INDEX.md'), indexMd)

  // diff 摘要
  const newEndpoints = new Set(indexRows.map((r) => r.key))
  const added = [...newEndpoints].filter((e) => !oldEndpoints.has(e))
  const removed = [...oldEndpoints].filter((e) => !newEndpoints.has(e))
  console.log(`[${site}] 完成：${indexRows.length} endpoints、${groups.size} 個 domain 檔`)
  if (oldEndpoints.size > 0) {
    if (added.length) console.log(`[${site}] 新增 endpoint:\n  ${added.join('\n  ')}`)
    if (removed.length) console.log(`[${site}] 移除 endpoint:\n  ${removed.join('\n  ')}`)
    if (!added.length && !removed.length)
      console.log(`[${site}] endpoint 清單無增減（快取未進版控，欄位層級變動請直接讀對應 paths/*.md 比對）`)
  }
}

main().catch((err) => {
  console.error(`[${site}] 失敗: ${err.message}`)
  process.exit(1)
})
