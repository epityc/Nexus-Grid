/**
 * Excel-compatible formula evaluation engine.
 * No external dependencies — pure TypeScript.
 *
 * Supported: arithmetic, comparison, text concat, cell refs, ranges,
 * and 70+ built-in functions (SUM, IF, VLOOKUP, TEXT, DATE, …).
 */

// ── Public types ───────────────────────────────────────────────────────────────
export type CellGetter = (row: number, col: number) => string

// ── Internal value types ───────────────────────────────────────────────────────
type Scalar = number | string | boolean | null
type Grid = Value[][]
type Value = Scalar | Grid | FErr

class FErr {
  constructor(public code: string) {}
  toString() { return this.code }
}

const E_DIV0  = new FErr('#DIV/0!')
const E_VALUE = new FErr('#VALUE!')
const E_REF   = new FErr('#REF!')
const E_NA    = new FErr('#N/A')
const E_NUM   = new FErr('#NUM!')
const E_NAME  = new FErr('#NAME?')
const E_CYCLE = new FErr('#CYCLE!')

// ── Coercions ─────────────────────────────────────────────────────────────────
function toNum(v: Value): number {
  if (v instanceof FErr) throw v
  if (typeof v === 'number') return v
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v === null || v === '') return 0
  const n = Number(v)
  if (isNaN(n)) throw E_VALUE
  return n
}

function toStr(v: Value): string {
  if (v instanceof FErr) throw v
  if (v === null) return ''
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (Array.isArray(v)) return toStr((v as Grid)[0][0])
  return String(v)
}

function toBool(v: Value): boolean {
  if (v instanceof FErr) throw v
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'string') {
    const u = v.toUpperCase()
    if (u === 'TRUE') return true
    if (u === 'FALSE') return false
    throw E_VALUE
  }
  return false
}

function flatten(v: Value): Scalar[] {
  if (v instanceof FErr) return []
  if (Array.isArray(v)) {
    const out: Scalar[] = []
    for (const row of v as Grid)
      for (const cell of row)
        out.push(...flatten(cell))
    return out
  }
  return [v as Scalar]
}

function numerics(v: Value[]): number[] {
  return flatten({ length: v.length, ...v } as unknown as Grid)
    .filter(x => typeof x === 'number' || typeof x === 'boolean')
    .map(x => typeof x === 'boolean' ? (x ? 1 : 0) : x as number)
}

// ── Cell address helpers ───────────────────────────────────────────────────────
function colIdx(letters: string): number {
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function parseCellAddr(ref: string): { row: number; col: number } | null {
  const m = ref.match(/^([A-Z]+)(\d+)$/)
  if (!m) return null
  return { col: colIdx(m[1]), row: parseInt(m[2]) - 1 }
}

function colToLetter(col: number): string {
  let s = ''
  col++
  while (col > 0) {
    const r = (col - 1) % 26
    s = String.fromCharCode(65 + r) + s
    col = Math.floor((col - 1) / 26)
  }
  return s
}

// ── Tokenizer ─────────────────────────────────────────────────────────────────
type TT = 'NUM' | 'STR' | 'BOOL' | 'ERR' | 'REF' | 'RANGE' | 'FUNC' | 'OP' | 'LP' | 'RP' | 'COMMA' | 'EOF'
interface Tok { t: TT; v: string }

function tokenize(src: string): Tok[] {
  if (src.startsWith('=')) src = src.slice(1)
  const toks: Tok[] = []
  let i = 0

  while (i < src.length) {
    if (src[i] <= ' ') { i++; continue }

    // String literal
    if (src[i] === '"') {
      i++; let s = ''
      while (i < src.length) {
        if (src[i] === '"') { i++; if (src[i] === '"') { s += '"'; i++ } else break }
        else s += src[i++]
      }
      toks.push({ t: 'STR', v: s }); continue
    }

    // Number
    if (/\d/.test(src[i]) || (src[i] === '.' && /\d/.test(src[i + 1] ?? ''))) {
      let n = ''
      while (i < src.length && /[\d.]/.test(src[i])) n += src[i++]
      if (/[eE]/.test(src[i] ?? '')) {
        n += src[i++]
        if (/[+\-]/.test(src[i] ?? '')) n += src[i++]
        while (/\d/.test(src[i] ?? '')) n += src[i++]
      }
      toks.push({ t: 'NUM', v: n }); continue
    }

    // Error literal
    if (src[i] === '#') {
      let e = ''
      while (i < src.length && /[A-Z#/0!?]/.test(src[i].toUpperCase())) e += src[i++]
      toks.push({ t: 'ERR', v: e.toUpperCase() }); continue
    }

    // Two-char operators
    const two = src.slice(i, i + 2)
    if (['<>', '>=', '<='].includes(two)) { toks.push({ t: 'OP', v: two }); i += 2; continue }

    if ('+-*/^&=<>%'.includes(src[i])) { toks.push({ t: 'OP', v: src[i++] }); continue }
    if (src[i] === '(') { toks.push({ t: 'LP', v: '(' }); i++; continue }
    if (src[i] === ')') { toks.push({ t: 'RP', v: ')' }); i++; continue }
    if (src[i] === ',' || src[i] === ';') { toks.push({ t: 'COMMA', v: ',' }); i++; continue }

    // Identifiers
    if (/[A-Za-z$]/.test(src[i])) {
      let letters = ''
      while (i < src.length && /[A-Za-z$]/.test(src[i])) {
        if (src[i] !== '$') letters += src[i]
        i++
      }
      if (i < src.length && src[i] === '$') i++ // skip $ before digits
      let digits = ''
      while (i < src.length && /\d/.test(src[i])) digits += src[i++]

      const up = letters.toUpperCase()
      if (digits) {
        const ref1 = up + digits
        if (i < src.length && src[i] === ':') {
          i++
          let l2 = ''
          while (i < src.length && /[A-Za-z$]/.test(src[i])) {
            if (src[i] !== '$') l2 += src[i]
            i++
          }
          if (i < src.length && src[i] === '$') i++
          let d2 = ''
          while (i < src.length && /\d/.test(src[i])) d2 += src[i++]
          toks.push({ t: 'RANGE', v: `${ref1}:${l2.toUpperCase() + d2}` })
        } else {
          toks.push({ t: 'REF', v: ref1 })
        }
      } else {
        if (up === 'TRUE') toks.push({ t: 'BOOL', v: 'TRUE' })
        else if (up === 'FALSE') toks.push({ t: 'BOOL', v: 'FALSE' })
        else if (i < src.length && src[i] === '(') toks.push({ t: 'FUNC', v: up })
        else toks.push({ t: 'REF', v: up })
      }
      continue
    }
    i++
  }
  toks.push({ t: 'EOF', v: '' })
  return toks
}

// ── AST ───────────────────────────────────────────────────────────────────────
type Node =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'bool'; v: boolean }
  | { k: 'err'; v: string }
  | { k: 'ref'; row: number; col: number }
  | { k: 'range'; r1: number; c1: number; r2: number; c2: number }
  | { k: 'fn'; name: string; args: Node[] }
  | { k: 'bin'; op: string; l: Node; r: Node }
  | { k: 'un'; op: string; a: Node }

// ── Parser ────────────────────────────────────────────────────────────────────
function parse(toks: Tok[]): Node {
  let pos = 0
  const peek = () => toks[pos]
  const adv  = () => toks[pos++]
  const eat  = (t: TT) => { if (peek().t !== t) throw E_VALUE; return adv() }

  function expr(): Node { return cmp() }

  function cmp(): Node {
    let n = concat()
    while (['=', '<>', '<', '<=', '>', '>='].includes(peek().v) && peek().t === 'OP') {
      const op = adv().v; n = { k: 'bin', op, l: n, r: concat() }
    }
    return n
  }

  function concat(): Node {
    let n = add()
    while (peek().t === 'OP' && peek().v === '&') { adv(); n = { k: 'bin', op: '&', l: n, r: add() } }
    return n
  }

  function add(): Node {
    let n = mul()
    while (peek().t === 'OP' && ['+', '-'].includes(peek().v)) {
      const op = adv().v; n = { k: 'bin', op, l: n, r: mul() }
    }
    return n
  }

  function mul(): Node {
    let n = pow()
    while (peek().t === 'OP' && ['*', '/'].includes(peek().v)) {
      const op = adv().v; n = { k: 'bin', op, l: n, r: pow() }
    }
    return n
  }

  function pow(): Node {
    const n = unary()
    if (peek().t === 'OP' && peek().v === '^') { adv(); return { k: 'bin', op: '^', l: n, r: unary() } }
    return n
  }

  function unary(): Node {
    if (peek().t === 'OP' && peek().v === '-') { adv(); return { k: 'un', op: '-', a: pct() } }
    if (peek().t === 'OP' && peek().v === '+') { adv(); return pct() }
    return pct()
  }

  function pct(): Node {
    let n = primary()
    if (peek().t === 'OP' && peek().v === '%') {
      adv(); n = { k: 'bin', op: '/', l: n, r: { k: 'num', v: 100 } }
    }
    return n
  }

  function primary(): Node {
    const tok = peek()
    if (tok.t === 'NUM')  { adv(); return { k: 'num', v: parseFloat(tok.v) } }
    if (tok.t === 'STR')  { adv(); return { k: 'str', v: tok.v } }
    if (tok.t === 'BOOL') { adv(); return { k: 'bool', v: tok.v === 'TRUE' } }
    if (tok.t === 'ERR')  { adv(); return { k: 'err', v: tok.v } }

    if (tok.t === 'REF') {
      adv()
      const a = parseCellAddr(tok.v)
      if (!a) throw E_REF
      return { k: 'ref', row: a.row, col: a.col }
    }

    if (tok.t === 'RANGE') {
      adv()
      const [a, b] = tok.v.split(':')
      const a1 = parseCellAddr(a), a2 = parseCellAddr(b)
      if (!a1 || !a2) throw E_REF
      return {
        k: 'range',
        r1: Math.min(a1.row, a2.row), c1: Math.min(a1.col, a2.col),
        r2: Math.max(a1.row, a2.row), c2: Math.max(a1.col, a2.col),
      }
    }

    if (tok.t === 'FUNC') {
      adv(); eat('LP')
      const args: Node[] = []
      while (peek().t !== 'RP' && peek().t !== 'EOF') {
        args.push(expr())
        if (peek().t === 'COMMA') adv()
      }
      eat('RP')
      return { k: 'fn', name: tok.v, args }
    }

    if (tok.t === 'LP') {
      adv(); const n = expr(); eat('RP'); return n
    }

    throw E_VALUE
  }

  return expr()
}

// ── Evaluator ─────────────────────────────────────────────────────────────────
interface Ctx { getCell: CellGetter; visiting: Set<string> }

function ev(node: Node, ctx: Ctx): Value {
  switch (node.k) {
    case 'num':  return node.v
    case 'str':  return node.v
    case 'bool': return node.v
    case 'err':  return new FErr(node.v)

    case 'ref': {
      const key = `${node.row},${node.col}`
      if (ctx.visiting.has(key)) return E_CYCLE
      ctx.visiting.add(key)
      const raw = ctx.getCell(node.row, node.col)
      const val = resolveRaw(raw, ctx)
      ctx.visiting.delete(key)
      return val
    }

    case 'range': {
      const grid: Grid = []
      for (let r = node.r1; r <= node.r2; r++) {
        const row: Value[] = []
        for (let c = node.c1; c <= node.c2; c++) {
          const key = `${r},${c}`
          if (ctx.visiting.has(key)) { row.push(E_CYCLE); continue }
          ctx.visiting.add(key)
          row.push(resolveRaw(ctx.getCell(r, c), ctx))
          ctx.visiting.delete(key)
        }
        grid.push(row)
      }
      return grid
    }

    case 'bin': {
      const l = ev(node.l, ctx), r = ev(node.r, ctx)
      return evalBin(node.op, l, r)
    }

    case 'un': {
      const v = ev(node.a, ctx)
      if (node.op === '-') { try { return -toNum(v) } catch(e) { return e instanceof FErr ? e : E_VALUE } }
      return v
    }

    case 'fn': return evalFn(node.name, node.args, ctx)
  }
}

function resolveRaw(raw: string, ctx: Ctx): Value {
  if (!raw) return null
  if (raw.startsWith('=')) {
    try { return ev(parse(tokenize(raw)), ctx) }
    catch (e) { return e instanceof FErr ? e : new FErr('#ERROR!') }
  }
  const n = Number(raw)
  if (raw.trim() !== '' && !isNaN(n)) return n
  if (raw.toUpperCase() === 'TRUE') return true
  if (raw.toUpperCase() === 'FALSE') return false
  return raw
}

function evalBin(op: string, a: Value, b: Value): Value {
  try {
    switch (op) {
      case '+':  return toNum(a) + toNum(b)
      case '-':  return toNum(a) - toNum(b)
      case '*':  return toNum(a) * toNum(b)
      case '/': { const d = toNum(b); if (d === 0) return E_DIV0; return toNum(a) / d }
      case '^':  return Math.pow(toNum(a), toNum(b))
      case '&':  return toStr(a) + toStr(b)
      case '=':  return cmpVals(a, b) === 0
      case '<>': return cmpVals(a, b) !== 0
      case '<':  return cmpVals(a, b) < 0
      case '<=': return cmpVals(a, b) <= 0
      case '>':  return cmpVals(a, b) > 0
      case '>=': return cmpVals(a, b) >= 0
    }
  } catch (e) { if (e instanceof FErr) return e }
  return E_VALUE
}

function cmpVals(a: Value, b: Value): number {
  if (a instanceof FErr || b instanceof FErr) throw E_VALUE
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase().localeCompare(b.toLowerCase())
  if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0)
  if (typeof a === 'number') return -1
  if (typeof b === 'number') return 1
  return 0
}

// ── Wildcard matching (for COUNTIF, SUMIF, etc.) ──────────────────────────────
function wildcardTest(pattern: string, text: string): boolean {
  // Convert Excel wildcard (* ? ~* ~?) to regex
  let re = '^'
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '~') {
      const next = pattern[++i] ?? ''
      re += next.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    } else if (c === '*') {
      re += '.*'
    } else if (c === '?') {
      re += '.'
    } else {
      re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
  }
  re += '$'
  return new RegExp(re, 'i').test(text)
}

function matchesCriteria(val: Scalar, criteria: Scalar): boolean {
  if (criteria === null) return val === null || val === '' || val === 0
  const cStr = String(criteria)
  // Check for comparison operators
  const opMatch = cStr.match(/^(>=|<=|<>|>|<|=)(.*)$/)
  if (opMatch) {
    const [, op, right] = opMatch
    const rv = isNaN(Number(right)) ? right : Number(right)
    return evalBin(op === '=' ? '=' : op, val, rv) === true
  }
  // Wildcard match for strings
  if (typeof criteria === 'string' && (criteria.includes('*') || criteria.includes('?'))) {
    return wildcardTest(criteria, String(val ?? ''))
  }
  // Exact match
  if (typeof val === 'number' && !isNaN(Number(cStr))) return val === Number(cStr)
  return String(val ?? '').toLowerCase() === cStr.toLowerCase()
}

// ── Function implementations ──────────────────────────────────────────────────
function evalFn(name: string, argNodes: Node[], ctx: Ctx): Value {
  // Lazy-eval helpers (for IF, IFERROR etc.)
  const arg = (i: number) => { try { return ev(argNodes[i], ctx) } catch(e) { return e instanceof FErr ? e : E_VALUE } }
  const args = () => argNodes.map((_, i) => arg(i))

  switch (name) {
    // ── Logical ────────────────────────────────────────────────────────────────
    case 'IF': {
      const cond = arg(0)
      try { return toBool(cond) ? arg(1) : (argNodes.length > 2 ? arg(2) : false) }
      catch(e) { return e instanceof FErr ? e : E_VALUE }
    }
    case 'IFS': {
      for (let i = 0; i + 1 < argNodes.length; i += 2) {
        try { if (toBool(arg(i))) return arg(i + 1) } catch {}
      }
      return E_NA
    }
    case 'IFERROR': {
      const v = arg(0)
      return v instanceof FErr ? arg(1) : v
    }
    case 'IFNA': {
      const v = arg(0)
      return (v instanceof FErr && v.code === '#N/A') ? arg(1) : v
    }
    case 'AND': {
      for (const a of args()) { try { if (!toBool(a)) return false } catch { return E_VALUE } }
      return true
    }
    case 'OR': {
      for (const a of args()) { try { if (toBool(a)) return true } catch { return E_VALUE } }
      return false
    }
    case 'NOT': {
      try { return !toBool(arg(0)) } catch(e) { return e instanceof FErr ? e : E_VALUE }
    }
    case 'XOR': {
      let c = 0
      for (const a of args()) { try { if (toBool(a)) c++ } catch { return E_VALUE } }
      return c % 2 === 1
    }
    case 'TRUE':  return true
    case 'FALSE': return false

    // ── Aggregate (SUM, AVERAGE, …) ─────────────────────────────────────────
    case 'SUM': {
      const nums = numerics(args())
      return nums.reduce((s, n) => s + n, 0)
    }
    case 'AVERAGE': {
      const nums = numerics(args())
      if (nums.length === 0) return E_DIV0
      return nums.reduce((s, n) => s + n, 0) / nums.length
    }
    case 'COUNT': {
      return flatten(args() as unknown as Grid).filter(v => typeof v === 'number').length
    }
    case 'COUNTA': {
      return flatten(args() as unknown as Grid).filter(v => v !== null && v !== '').length
    }
    case 'COUNTBLANK': {
      return flatten(args() as unknown as Grid).filter(v => v === null || v === '').length
    }
    case 'MIN': {
      const nums = numerics(args())
      return nums.length ? Math.min(...nums) : 0
    }
    case 'MAX': {
      const nums = numerics(args())
      return nums.length ? Math.max(...nums) : 0
    }
    case 'MINA': {
      const ns = flatten(args() as unknown as Grid)
        .map(v => typeof v === 'boolean' ? (v ? 1 : 0) : (typeof v === 'number' ? v : null))
        .filter(v => v !== null) as number[]
      return ns.length ? Math.min(...ns) : 0
    }
    case 'MAXA': {
      const ns = flatten(args() as unknown as Grid)
        .map(v => typeof v === 'boolean' ? (v ? 1 : 0) : (typeof v === 'number' ? v : null))
        .filter(v => v !== null) as number[]
      return ns.length ? Math.max(...ns) : 0
    }
    case 'PRODUCT': {
      const nums = numerics(args())
      return nums.reduce((p, n) => p * n, 1)
    }
    case 'MEDIAN': {
      const nums = numerics(args()).sort((a, b) => a - b)
      if (!nums.length) return E_NUM
      const m = Math.floor(nums.length / 2)
      return nums.length % 2 ? nums[m] : (nums[m - 1] + nums[m]) / 2
    }
    case 'MODE':
    case 'MODE.SNGL': {
      const nums = numerics(args())
      if (!nums.length) return E_NA
      const freq = new Map<number, number>()
      nums.forEach(n => freq.set(n, (freq.get(n) ?? 0) + 1))
      let bestN = nums[0], bestF = 0
      freq.forEach((f, n) => { if (f > bestF) { bestF = f; bestN = n } })
      return bestN
    }
    case 'STDEV':
    case 'STDEV.S': {
      const nums = numerics(args())
      if (nums.length < 2) return E_DIV0
      const avg = nums.reduce((s, n) => s + n, 0) / nums.length
      const variance = nums.reduce((s, n) => s + (n - avg) ** 2, 0) / (nums.length - 1)
      return Math.sqrt(variance)
    }
    case 'STDEVP':
    case 'STDEV.P': {
      const nums = numerics(args())
      if (!nums.length) return E_DIV0
      const avg = nums.reduce((s, n) => s + n, 0) / nums.length
      const variance = nums.reduce((s, n) => s + (n - avg) ** 2, 0) / nums.length
      return Math.sqrt(variance)
    }
    case 'VAR':
    case 'VAR.S': {
      const nums = numerics(args())
      if (nums.length < 2) return E_DIV0
      const avg = nums.reduce((s, n) => s + n, 0) / nums.length
      return nums.reduce((s, n) => s + (n - avg) ** 2, 0) / (nums.length - 1)
    }
    case 'VARP':
    case 'VAR.P': {
      const nums = numerics(args())
      if (!nums.length) return E_DIV0
      const avg = nums.reduce((s, n) => s + n, 0) / nums.length
      return nums.reduce((s, n) => s + (n - avg) ** 2, 0) / nums.length
    }
    case 'LARGE': {
      const nums = numerics([arg(0)]).sort((a, b) => b - a)
      const k = Math.round(toNum(arg(1)))
      if (k < 1 || k > nums.length) return E_NUM
      return nums[k - 1]
    }
    case 'SMALL': {
      const nums = numerics([arg(0)]).sort((a, b) => a - b)
      const k = Math.round(toNum(arg(1)))
      if (k < 1 || k > nums.length) return E_NUM
      return nums[k - 1]
    }
    case 'RANK':
    case 'RANK.EQ': {
      const val = toNum(arg(0))
      const nums = numerics([arg(1)])
      const order = argNodes.length > 2 ? toNum(arg(2)) : 0
      const sorted = [...nums].sort((a, b) => order ? a - b : b - a)
      const rank = sorted.indexOf(val)
      return rank === -1 ? E_NA : rank + 1
    }
    case 'PERCENTILE':
    case 'PERCENTILE.INC': {
      const nums = numerics([arg(0)]).sort((a, b) => a - b)
      const p = toNum(arg(1))
      if (p < 0 || p > 1) return E_NUM
      const idx = p * (nums.length - 1)
      const lo = Math.floor(idx)
      return lo === nums.length - 1 ? nums[lo] : nums[lo] + (idx - lo) * (nums[lo + 1] - nums[lo])
    }
    case 'QUARTILE':
    case 'QUARTILE.INC': {
      const nums = numerics([arg(0)]).sort((a, b) => a - b)
      const q = toNum(arg(1))
      if (q < 0 || q > 4) return E_NUM
      const p = q / 4
      const idx = p * (nums.length - 1)
      const lo = Math.floor(idx)
      return lo >= nums.length - 1 ? nums[nums.length - 1] : nums[lo] + (idx - lo) * (nums[lo + 1] - nums[lo])
    }

    // ── Conditional aggregate ──────────────────────────────────────────────────
    case 'SUMIF': {
      const rangeVals = flatten([arg(0)])
      const criteria = arg(1) as Scalar
      const sumRange = argNodes.length > 2 ? flatten([arg(2)]) : rangeVals
      let total = 0
      rangeVals.forEach((v, i) => {
        if (matchesCriteria(v, criteria)) total += (typeof sumRange[i] === 'number' ? sumRange[i] as number : 0)
      })
      return total
    }
    case 'COUNTIF': {
      const rangeVals = flatten([arg(0)])
      const criteria = arg(1) as Scalar
      return rangeVals.filter(v => matchesCriteria(v, criteria)).length
    }
    case 'AVERAGEIF': {
      const rangeVals = flatten([arg(0)])
      const criteria = arg(1) as Scalar
      const avgRange = argNodes.length > 2 ? flatten([arg(2)]) : rangeVals
      const nums: number[] = []
      rangeVals.forEach((v, i) => {
        if (matchesCriteria(v, criteria)) {
          const av = avgRange[i]
          if (typeof av === 'number') nums.push(av)
        }
      })
      if (!nums.length) return E_DIV0
      return nums.reduce((s, n) => s + n, 0) / nums.length
    }
    case 'SUMIFS': {
      // SUMIFS(sum_range, criteria_range1, criteria1, ...)
      const sumVals = flatten([arg(0)])
      let mask: boolean[] = sumVals.map(() => true)
      for (let i = 1; i + 1 < argNodes.length; i += 2) {
        const rangeVals = flatten([arg(i)])
        const criteria = arg(i + 1) as Scalar
        mask = mask.map((m, j) => m && matchesCriteria(rangeVals[j], criteria))
      }
      return sumVals.reduce((s, v, i) => s + (mask[i] && typeof v === 'number' ? v : 0), 0)
    }
    case 'COUNTIFS': {
      const firstRange = flatten([arg(0)])
      let mask: boolean[] = firstRange.map(() => true)
      for (let i = 0; i + 1 < argNodes.length; i += 2) {
        const rangeVals = flatten([arg(i)])
        const criteria = arg(i + 1) as Scalar
        mask = mask.map((m, j) => m && matchesCriteria(rangeVals[j], criteria))
      }
      return mask.filter(Boolean).length
    }
    case 'AVERAGEIFS': {
      const avgVals = flatten([arg(0)])
      let mask: boolean[] = avgVals.map(() => true)
      for (let i = 1; i + 1 < argNodes.length; i += 2) {
        const rangeVals = flatten([arg(i)])
        const criteria = arg(i + 1) as Scalar
        mask = mask.map((m, j) => m && matchesCriteria(rangeVals[j], criteria))
      }
      const nums = avgVals.filter((_, i) => mask[i] && typeof avgVals[i] === 'number') as number[]
      if (!nums.length) return E_DIV0
      return nums.reduce((s, n) => s + n, 0) / nums.length
    }

    // ── Math & Trig ────────────────────────────────────────────────────────────
    case 'ABS':       { return Math.abs(toNum(arg(0))) }
    case 'SQRT':      { const n = toNum(arg(0)); if (n < 0) return E_NUM; return Math.sqrt(n) }
    case 'POWER':     { return Math.pow(toNum(arg(0)), toNum(arg(1))) }
    case 'EXP':       { return Math.exp(toNum(arg(0))) }
    case 'LN':        { const n = toNum(arg(0)); if (n <= 0) return E_NUM; return Math.log(n) }
    case 'LOG':       {
      const n = toNum(arg(0))
      const base = argNodes.length > 1 ? toNum(arg(1)) : 10
      if (n <= 0 || base <= 0 || base === 1) return E_NUM
      return Math.log(n) / Math.log(base)
    }
    case 'LOG10':     { const n = toNum(arg(0)); if (n <= 0) return E_NUM; return Math.log10(n) }
    case 'MOD':       { const d = toNum(arg(1)); if (d === 0) return E_DIV0; return toNum(arg(0)) % d }
    case 'INT':       { return Math.floor(toNum(arg(0))) }
    case 'TRUNC':     { const n = toNum(arg(0)); return n < 0 ? Math.ceil(n) : Math.floor(n) }
    case 'ROUND':     { const dp = argNodes.length > 1 ? toNum(arg(1)) : 0; const f = Math.pow(10, dp); return Math.round(toNum(arg(0)) * f) / f }
    case 'ROUNDUP':   { const dp = argNodes.length > 1 ? toNum(arg(1)) : 0; const f = Math.pow(10, dp); return Math.ceil(toNum(arg(0)) * f) / f }
    case 'ROUNDDOWN': { const dp = argNodes.length > 1 ? toNum(arg(1)) : 0; const f = Math.pow(10, dp); return Math.floor(toNum(arg(0)) * f) / f }
    case 'CEILING':
    case 'CEILING.MATH': {
      const n = toNum(arg(0)), sig = argNodes.length > 1 ? toNum(arg(1)) : 1
      if (sig === 0) return 0
      return Math.ceil(n / sig) * sig
    }
    case 'FLOOR':
    case 'FLOOR.MATH': {
      const n = toNum(arg(0)), sig = argNodes.length > 1 ? toNum(arg(1)) : 1
      if (sig === 0) return 0
      return Math.floor(n / sig) * sig
    }
    case 'MROUND': {
      const n = toNum(arg(0)), m = toNum(arg(1))
      if (m === 0) return E_NUM
      return Math.round(n / m) * m
    }
    case 'ODD':  { const n = Math.ceil(Math.abs(toNum(arg(0)))); return (n % 2 === 0 ? n + 1 : n) * Math.sign(toNum(arg(0)) || 1) }
    case 'EVEN': { const n = Math.ceil(Math.abs(toNum(arg(0)))); return (n % 2 !== 0 ? n + 1 : n) * Math.sign(toNum(arg(0)) || 1) }
    case 'SIGN': { const n = toNum(arg(0)); return n > 0 ? 1 : n < 0 ? -1 : 0 }
    case 'PI':   { return Math.PI }
    case 'RAND': { return Math.random() }
    case 'RANDBETWEEN': {
      const lo = Math.ceil(toNum(arg(0))), hi = Math.floor(toNum(arg(1)))
      return lo + Math.floor(Math.random() * (hi - lo + 1))
    }
    case 'SIN':   { return Math.sin(toNum(arg(0))) }
    case 'COS':   { return Math.cos(toNum(arg(0))) }
    case 'TAN':   { return Math.tan(toNum(arg(0))) }
    case 'ASIN':  { return Math.asin(toNum(arg(0))) }
    case 'ACOS':  { return Math.acos(toNum(arg(0))) }
    case 'ATAN':  { return Math.atan(toNum(arg(0))) }
    case 'ATAN2': { return Math.atan2(toNum(arg(0)), toNum(arg(1))) }
    case 'DEGREES': { return toNum(arg(0)) * 180 / Math.PI }
    case 'RADIANS': { return toNum(arg(0)) * Math.PI / 180 }
    case 'FACT': {
      const n = Math.round(toNum(arg(0)))
      if (n < 0) return E_NUM
      let f = 1; for (let i = 2; i <= n; i++) f *= i; return f
    }
    case 'COMBIN': {
      const n = Math.round(toNum(arg(0))), k = Math.round(toNum(arg(1)))
      if (k < 0 || k > n) return E_NUM
      let r = 1; for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1); return Math.round(r)
    }
    case 'SUMPRODUCT': {
      const arrays = argNodes.map(n => numerics([ev(n, ctx)]))
      const len = Math.min(...arrays.map(a => a.length))
      let total = 0
      for (let i = 0; i < len; i++) total += arrays.reduce((p, a) => p * a[i], 1)
      return total
    }
    case 'GCD': {
      let a = Math.abs(Math.round(toNum(arg(0)))), b = Math.abs(Math.round(toNum(arg(1))))
      while (b) { [a, b] = [b, a % b] }
      return a
    }
    case 'LCM': {
      let a = Math.abs(Math.round(toNum(arg(0)))), b = Math.abs(Math.round(toNum(arg(1))))
      const gcd = (x: number, y: number): number => y ? gcd(y, x % y) : x
      return a && b ? a / gcd(a, b) * b : 0
    }

    // ── Text ──────────────────────────────────────────────────────────────────
    case 'LEN':    { return toStr(arg(0)).length }
    case 'UPPER':  { return toStr(arg(0)).toUpperCase() }
    case 'LOWER':  { return toStr(arg(0)).toLowerCase() }
    case 'PROPER': { return toStr(arg(0)).replace(/\b\w/g, c => c.toUpperCase()) }
    case 'TRIM':   { return toStr(arg(0)).trim().replace(/\s+/g, ' ') }
    case 'CLEAN':  { return toStr(arg(0)).replace(/[\x00-\x1F]/g, '') }
    case 'LEFT':   { const s = toStr(arg(0)); const n = argNodes.length > 1 ? Math.round(toNum(arg(1))) : 1; return s.slice(0, n) }
    case 'RIGHT':  { const s = toStr(arg(0)); const n = argNodes.length > 1 ? Math.round(toNum(arg(1))) : 1; return s.slice(-n) || '' }
    case 'MID':    { const s = toStr(arg(0)); const start = Math.round(toNum(arg(1))) - 1; const len2 = Math.round(toNum(arg(2))); return s.slice(start, start + len2) }
    case 'REPT':   { return toStr(arg(0)).repeat(Math.max(0, Math.round(toNum(arg(1))))) }
    case 'CONCAT':
    case 'CONCATENATE': { return args().map(toStr).join('') }
    case 'TEXTJOIN': {
      const delim = toStr(arg(0))
      const ignoreEmpty = toBool(arg(1))
      const vals = args().slice(2).map(toStr)
      return (ignoreEmpty ? vals.filter(Boolean) : vals).join(delim)
    }
    case 'SUBSTITUTE': {
      const s = toStr(arg(0)), old = toStr(arg(1)), rep = toStr(arg(2))
      const nth = argNodes.length > 3 ? Math.round(toNum(arg(3))) : 0
      if (!nth) return s.split(old).join(rep)
      let count = 0
      return s.replace(new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), m => {
        count++
        return count === nth ? rep : m
      })
    }
    case 'REPLACE': {
      const s = toStr(arg(0)), start = Math.round(toNum(arg(1))) - 1
      const numChars = Math.round(toNum(arg(2))), rep = toStr(arg(3))
      return s.slice(0, start) + rep + s.slice(start + numChars)
    }
    case 'FIND': {
      const needle = toStr(arg(0)), haystack = toStr(arg(1))
      const startPos = argNodes.length > 2 ? Math.round(toNum(arg(2))) - 1 : 0
      const idx = haystack.indexOf(needle, startPos)
      if (idx === -1) return E_VALUE
      return idx + 1
    }
    case 'SEARCH': {
      const needle = toStr(arg(0)), haystack = toStr(arg(1))
      const startPos = argNodes.length > 2 ? Math.round(toNum(arg(2))) - 1 : 0
      const idx = haystack.toLowerCase().indexOf(needle.toLowerCase(), startPos)
      if (idx === -1) return E_VALUE
      return idx + 1
    }
    case 'EXACT': { return toStr(arg(0)) === toStr(arg(1)) }
    case 'VALUE': {
      const s = toStr(arg(0)).replace(/,/g, '')
      const n = Number(s)
      if (isNaN(n)) return E_VALUE
      return n
    }
    case 'TEXT': {
      const val = arg(0)
      const fmt = toStr(arg(1))
      return formatNumber(typeof val === 'number' ? val : toNum(val), fmt)
    }
    case 'CHAR':   { return String.fromCharCode(Math.round(toNum(arg(0)))) }
    case 'CODE':   { const s = toStr(arg(0)); if (!s) return E_VALUE; return s.charCodeAt(0) }
    case 'ASC':    { return toStr(arg(0)) } // no-op in JS (full-width conversion not needed)
    case 'T':      { const v = arg(0); return typeof v === 'string' ? v : '' }
    case 'N':      { const v = arg(0); return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0 }
    case 'DOLLAR': {
      const n = toNum(arg(0)), dp = argNodes.length > 1 ? Math.round(toNum(arg(1))) : 2
      return '$' + n.toFixed(Math.max(0, dp))
    }
    case 'FIXED': {
      const n = toNum(arg(0)), dp = argNodes.length > 1 ? Math.round(toNum(arg(1))) : 2
      return n.toFixed(Math.max(0, dp))
    }
    case 'NUMBERVALUE': {
      const s = toStr(arg(0)).replace(/[, ]/g, '')
      const n = Number(s)
      return isNaN(n) ? E_VALUE : n
    }

    // ── Lookup & Reference ────────────────────────────────────────────────────
    case 'VLOOKUP': {
      const lookup = arg(0) as Scalar
      const tableVal = arg(1)
      const colIdx2 = Math.round(toNum(arg(2)))
      const exact = argNodes.length > 3 ? !toBool(arg(3)) : false
      if (!Array.isArray(tableVal)) return E_VALUE
      const table = tableVal as Grid
      if (!exact) {
        // Approximate match: find last row where first col <= lookup
        let result: Value = E_NA
        for (const row of table) {
          if (cmpVals(row[0] as Scalar, lookup) <= 0) result = row[colIdx2 - 1]
          else break
        }
        return result
      } else {
        for (const row of table) {
          if (cmpVals(row[0] as Scalar, lookup) === 0) return row[colIdx2 - 1]
        }
        return E_NA
      }
    }
    case 'HLOOKUP': {
      const lookup = arg(0) as Scalar
      const tableVal = arg(1)
      const rowIdx = Math.round(toNum(arg(2)))
      const exact = argNodes.length > 3 ? !toBool(arg(3)) : false
      if (!Array.isArray(tableVal)) return E_VALUE
      const table = tableVal as Grid
      const header = table[0] ?? []
      if (!exact) {
        let col = -1
        for (let c = 0; c < header.length; c++) {
          if (cmpVals(header[c] as Scalar, lookup) <= 0) col = c
          else break
        }
        if (col === -1) return E_NA
        return (table[rowIdx - 1] ?? [])[col] ?? null
      } else {
        for (let c = 0; c < header.length; c++) {
          if (cmpVals(header[c] as Scalar, lookup) === 0)
            return (table[rowIdx - 1] ?? [])[c] ?? null
        }
        return E_NA
      }
    }
    case 'MATCH': {
      const lookup = arg(0) as Scalar
      const arr = flatten([arg(1)])
      const mode = argNodes.length > 2 ? Math.round(toNum(arg(2))) : 1
      if (mode === 0) {
        const idx = arr.findIndex(v => matchesCriteria(v, lookup))
        return idx === -1 ? E_NA : idx + 1
      } else if (mode === 1) {
        let result = -1
        for (let i = 0; i < arr.length; i++) { if (cmpVals(arr[i], lookup) <= 0) result = i; else break }
        return result === -1 ? E_NA : result + 1
      } else {
        let result = -1
        for (let i = arr.length - 1; i >= 0; i--) { if (cmpVals(arr[i], lookup) >= 0) result = i; else break }
        return result === -1 ? E_NA : result + 1
      }
    }
    case 'INDEX': {
      const arr = arg(0)
      const rowNum = Math.round(toNum(arg(1)))
      const colNum = argNodes.length > 2 ? Math.round(toNum(arg(2))) : 1
      if (!Array.isArray(arr)) {
        if (rowNum === 1) return arr
        return E_REF
      }
      const grid2 = arr as Grid
      const row = grid2[rowNum - 1]
      if (!row) return E_REF
      if (colNum === 0) return row
      return row[colNum - 1] ?? E_REF
    }
    case 'CHOOSE': {
      const idx = Math.round(toNum(arg(0)))
      if (idx < 1 || idx >= argNodes.length) return E_VALUE
      return arg(idx)
    }
    case 'LOOKUP': {
      const lookup = arg(0) as Scalar
      const arr = flatten([arg(1)])
      const result = argNodes.length > 2 ? flatten([arg(2)]) : arr
      let found = -1
      for (let i = 0; i < arr.length; i++) { if (cmpVals(arr[i], lookup) <= 0) found = i; else break }
      return found === -1 ? E_NA : result[found] ?? E_NA
    }
    case 'OFFSET': {
      // OFFSET(ref, rows, cols, [height], [width]) — returns value at offset cell
      const base = argNodes[0]
      if (base.k !== 'ref' && base.k !== 'range') return E_REF
      const r0 = base.k === 'ref' ? base.row : base.r1
      const c0 = base.k === 'ref' ? base.col : base.c1
      const dr = Math.round(toNum(arg(1))), dc = Math.round(toNum(arg(2)))
      return resolveRaw(ctx.getCell(r0 + dr, c0 + dc), ctx)
    }
    case 'ROW': {
      if (!argNodes.length) return 1 // no reference to current row in this engine
      const a = argNodes[0]
      if (a.k === 'ref') return a.row + 1
      if (a.k === 'range') return a.r1 + 1
      return E_VALUE
    }
    case 'COLUMN': {
      if (!argNodes.length) return 1
      const a = argNodes[0]
      if (a.k === 'ref') return a.col + 1
      if (a.k === 'range') return a.c1 + 1
      return E_VALUE
    }
    case 'ROWS': {
      const a = argNodes[0]
      if (a.k === 'range') return a.r2 - a.r1 + 1
      return 1
    }
    case 'COLUMNS': {
      const a = argNodes[0]
      if (a.k === 'range') return a.c2 - a.c1 + 1
      return 1
    }
    case 'ADDRESS': {
      const row = Math.round(toNum(arg(0))), col = Math.round(toNum(arg(1)))
      return `${colToLetter(col - 1)}${row}`
    }
    case 'INDIRECT': {
      const ref = toStr(arg(0)).toUpperCase()
      const addr = parseCellAddr(ref.replace(/\$/g, ''))
      if (!addr) return E_REF
      return resolveRaw(ctx.getCell(addr.row, addr.col), ctx)
    }
    case 'TRANSPOSE': {
      const val = arg(0)
      if (!Array.isArray(val)) return [[val]]
      const grid = val as Grid
      const rows2 = grid.length, cols = Math.max(...grid.map(r => r.length))
      return Array.from({ length: cols }, (_, c) => Array.from({ length: rows2 }, (_, r) => grid[r][c] ?? null))
    }

    // ── Date & Time ───────────────────────────────────────────────────────────
    case 'TODAY': { return dateToSerial(new Date()) }
    case 'NOW':   { const d = new Date(); return dateToSerial(d) + d.getHours() / 24 + d.getMinutes() / 1440 }
    case 'DATE': {
      const d = new Date(Math.round(toNum(arg(0))), Math.round(toNum(arg(1))) - 1, Math.round(toNum(arg(2))))
      return dateToSerial(d)
    }
    case 'TIME': {
      return (Math.round(toNum(arg(0))) * 3600 + Math.round(toNum(arg(1))) * 60 + Math.round(toNum(arg(2)))) / 86400
    }
    case 'YEAR':    { return serialToDate(toNum(arg(0))).getFullYear() }
    case 'MONTH':   { return serialToDate(toNum(arg(0))).getMonth() + 1 }
    case 'DAY':     { return serialToDate(toNum(arg(0))).getDate() }
    case 'HOUR':    { return Math.floor((toNum(arg(0)) % 1) * 24) }
    case 'MINUTE':  { return Math.floor(((toNum(arg(0)) % 1) * 24 % 1) * 60) }
    case 'SECOND':  { return Math.floor((((toNum(arg(0)) % 1) * 24 % 1) * 60 % 1) * 60) }
    case 'WEEKDAY': {
      const d = serialToDate(toNum(arg(0)))
      const type = argNodes.length > 1 ? toNum(arg(1)) : 1
      const dow = d.getDay() // 0=Sun
      if (type === 2) return dow === 0 ? 7 : dow
      if (type === 3) return dow === 0 ? 6 : dow - 1
      return dow + 1 // type=1: 1=Sun
    }
    case 'WEEKNUM': {
      const d = serialToDate(toNum(arg(0)))
      const jan1 = new Date(d.getFullYear(), 0, 1)
      return Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
    }
    case 'DAYS':     { return Math.round(toNum(arg(0))) - Math.round(toNum(arg(1))) }
    case 'DAYS360': { return Math.round((toNum(arg(0)) - toNum(arg(1))) * 360 / 365) }
    case 'EDATE': {
      const d = serialToDate(toNum(arg(0)))
      d.setMonth(d.getMonth() + Math.round(toNum(arg(1))))
      return dateToSerial(d)
    }
    case 'EOMONTH': {
      const d = serialToDate(toNum(arg(0)))
      const months = Math.round(toNum(arg(1)))
      return dateToSerial(new Date(d.getFullYear(), d.getMonth() + months + 1, 0))
    }
    case 'NETWORKDAYS': {
      // Approximate (ignores holidays arg)
      const start = serialToDate(toNum(arg(0))), end = serialToDate(toNum(arg(1)))
      let count = 0, cur = new Date(start)
      while (cur <= end) { const d = cur.getDay(); if (d !== 0 && d !== 6) count++; cur.setDate(cur.getDate() + 1) }
      return count
    }
    case 'DATEDIF': {
      const start = serialToDate(toNum(arg(0))), end = serialToDate(toNum(arg(1)))
      const unit = toStr(arg(2)).toUpperCase()
      if (unit === 'D') return Math.floor((end.getTime() - start.getTime()) / 86400000)
      if (unit === 'M') return (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth()
      if (unit === 'Y') return end.getFullYear() - start.getFullYear()
      if (unit === 'MD') return end.getDate() - start.getDate()
      if (unit === 'YM') return (end.getMonth() - start.getMonth() + 12) % 12
      if (unit === 'YD') {
        const ys = new Date(end.getFullYear(), start.getMonth(), start.getDate())
        return Math.floor((end.getTime() - ys.getTime()) / 86400000)
      }
      return E_VALUE
    }
    case 'DATEVALUE': {
      const d = new Date(toStr(arg(0)))
      if (isNaN(d.getTime())) return E_VALUE
      return dateToSerial(d)
    }
    case 'TIMEVALUE': {
      const parts = toStr(arg(0)).split(':').map(Number)
      if (parts.length < 2) return E_VALUE
      return (parts[0] * 3600 + (parts[1] ?? 0) * 60 + (parts[2] ?? 0)) / 86400
    }

    // ── Information ───────────────────────────────────────────────────────────
    case 'ISNUMBER':  { const v = arg(0); return typeof v === 'number' }
    case 'ISTEXT':    { const v = arg(0); return typeof v === 'string' }
    case 'ISLOGICAL': { const v = arg(0); return typeof v === 'boolean' }
    case 'ISBLANK':   { const v = arg(0); return v === null || v === '' }
    case 'ISERROR':   { const v = arg(0); return v instanceof FErr }
    case 'ISERR':     { const v = arg(0); return v instanceof FErr && v.code !== '#N/A' }
    case 'ISNA':      { const v = arg(0); return v instanceof FErr && v.code === '#N/A' }
    case 'ISEVEN':    { return Math.abs(toNum(arg(0))) % 2 === 0 }
    case 'ISODD':     { return Math.abs(toNum(arg(0))) % 2 !== 0 }
    case 'ISREF':     { const n = argNodes[0]; return n.k === 'ref' || n.k === 'range' }
    case 'ISNULL':    { const v = arg(0); return v === null }
    case 'TYPE': {
      const v = arg(0)
      if (typeof v === 'number') return 1
      if (typeof v === 'string') return 2
      if (typeof v === 'boolean') return 4
      if (v instanceof FErr) return 16
      if (Array.isArray(v)) return 64
      return 1
    }
    case 'NA':    { return E_NA }
    case 'ERROR.TYPE': {
      const v = arg(0)
      if (!(v instanceof FErr)) return E_NA
      const map: Record<string, number> = {
        '#NULL!': 1, '#DIV/0!': 2, '#VALUE!': 3, '#REF!': 4,
        '#NAME?': 5, '#NUM!': 6, '#N/A': 7
      }
      return map[v.code] ?? 8
    }
    case 'CELL': { return '' } // simplified

    // ── Financial (common ones) ────────────────────────────────────────────────
    case 'PMT': {
      const rate = toNum(arg(0)), nper = toNum(arg(1)), pv = toNum(arg(2))
      const fv = argNodes.length > 3 ? toNum(arg(3)) : 0
      if (rate === 0) return -(pv + fv) / nper
      return -(pv * rate * Math.pow(1 + rate, nper) + fv * rate) / (Math.pow(1 + rate, nper) - 1)
    }
    case 'PV': {
      const rate = toNum(arg(0)), nper = toNum(arg(1)), pmt = toNum(arg(2))
      const fv = argNodes.length > 3 ? toNum(arg(3)) : 0
      if (rate === 0) return -(pmt * nper + fv)
      return -(pmt * (1 - Math.pow(1 + rate, -nper)) / rate + fv * Math.pow(1 + rate, -nper))
    }
    case 'FV': {
      const rate = toNum(arg(0)), nper = toNum(arg(1)), pmt = toNum(arg(2))
      const pv = argNodes.length > 3 ? toNum(arg(3)) : 0
      if (rate === 0) return -(pv + pmt * nper)
      return -(pv * Math.pow(1 + rate, nper) + pmt * (Math.pow(1 + rate, nper) - 1) / rate)
    }
    case 'NPER': {
      const rate = toNum(arg(0)), pmt = toNum(arg(1)), pv = toNum(arg(2))
      const fv = argNodes.length > 3 ? toNum(arg(3)) : 0
      if (rate === 0) return -(pv + fv) / pmt
      return Math.log((-fv + pmt / rate) / (pv + pmt / rate)) / Math.log(1 + rate)
    }
    case 'RATE': {
      // Iterative approximation
      const nper = toNum(arg(0)), pmt = toNum(arg(1)), pv = toNum(arg(2))
      const fv = argNodes.length > 3 ? toNum(arg(3)) : 0
      let rate = 0.1
      for (let i = 0; i < 100; i++) {
        const r1 = Math.pow(1 + rate, nper)
        const f = pv * r1 + pmt * (r1 - 1) / rate + fv
        const df = pv * nper * Math.pow(1 + rate, nper - 1) + pmt * (nper * (rate * Math.pow(1 + rate, nper - 1) - (r1 - 1) / rate)) / (rate * rate)
        rate -= f / df
        if (Math.abs(f) < 1e-10) break
      }
      return rate
    }
    case 'NPV': {
      const rate = toNum(arg(0))
      const vals = flatten(args().slice(1)) as number[]
      return vals.reduce((s, v, i) => s + v / Math.pow(1 + rate, i + 1), 0)
    }
    case 'SLN': {
      const cost = toNum(arg(0)), salvage = toNum(arg(1)), life = toNum(arg(2))
      return (cost - salvage) / life
    }

    // ── Array functions ────────────────────────────────────────────────────────
    case 'FREQUENCY': {
      const data = numerics([arg(0)])
      const bins = numerics([arg(1)]).sort((a, b) => a - b)
      const result: number[] = new Array(bins.length + 1).fill(0)
      data.forEach(v => {
        const idx = bins.findIndex(b => v <= b)
        result[idx === -1 ? bins.length : idx]++
      })
      return result.map(v => [v])
    }
    case 'UNIQUE': {
      const vals = flatten([arg(0)])
      const seen = new Set<string>()
      return vals.filter(v => { const k = String(v); if (seen.has(k)) return false; seen.add(k); return true }).map(v => [v])
    }

    default:
      return E_NAME
  }
}

// ── Date serial helpers ────────────────────────────────────────────────────────
function dateToSerial(d: Date): number {
  // Excel date serial: days since 1900-01-01 (with the 1900 leap year bug)
  const epoch = Date.UTC(1899, 11, 30)
  return Math.floor((d.getTime() - epoch) / 86400000)
}

function serialToDate(serial: number): Date {
  const epoch = Date.UTC(1899, 11, 30)
  return new Date(epoch + Math.floor(serial) * 86400000)
}

// ── Number formatting ─────────────────────────────────────────────────────────
function formatNumber(n: number, fmt: string): string {
  // Very simplified TEXT() formatting
  if (fmt.includes('%')) return (n * 100).toFixed(fmt.match(/0+\.?(0*)/)?.[1]?.length ?? 0) + '%'
  const dp = (fmt.match(/\.0*/)?.[0]?.length ?? 1) - 1
  if (fmt.toLowerCase().includes('e')) return n.toExponential(dp)
  if (fmt.startsWith('$')) return '$' + Math.abs(n).toFixed(Math.max(0, dp))
  if (fmt.includes('0') || fmt.includes('#')) return n.toFixed(Math.max(0, dp))
  return String(n)
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Evaluate a cell's raw content.
 * - If it starts with '=', parse and evaluate as a formula.
 * - Otherwise, interpret as a number, boolean, or string literal.
 *
 * Returns a display string (computed value).
 */
export function evaluateCell(raw: string, getCellRaw: CellGetter): string {
  if (!raw) return ''
  if (!raw.startsWith('=')) {
    // Plain value
    return raw
  }

  const ctx: Ctx = { getCell: getCellRaw, visiting: new Set() }
  try {
    const toks = tokenize(raw)
    const ast  = parse(toks)
    const val  = ev(ast, ctx)
    return formatValue(val)
  } catch (e) {
    if (e instanceof FErr) return e.code
    return '#ERROR!'
  }
}

function formatValue(val: Value): string {
  if (val instanceof FErr) return val.code
  if (val === null || val === undefined) return ''
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
  if (typeof val === 'number') {
    // Round to avoid floating-point display artifacts (e.g., 0.30000000000000004)
    const rounded = Math.round(val * 1e10) / 1e10
    return String(rounded)
  }
  if (Array.isArray(val)) {
    // Return top-left cell of a range
    const first = (val as Grid)[0]?.[0]
    return first !== undefined ? formatValue(first) : ''
  }
  return String(val)
}
