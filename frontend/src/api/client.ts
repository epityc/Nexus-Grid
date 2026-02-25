import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use(config => {
  const token = localStorage.getItem('nexus_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export async function generateFormula(description: string): Promise<string> {
  const res = await api.post('/ai/formula', { description })
  return res.data.formula
}

export async function explainFormula(formula: string): Promise<string> {
  const res = await api.post('/ai/explain', { formula })
  return res.data.explanation
}

export async function aiQuery(sheetId: string, query: string): Promise<string> {
  const res = await api.post('/ai/query', { sheet_id: sheetId, query })
  return res.data.answer
}

export async function aiAnalyze(sheetId: string, question?: string): Promise<string> {
  const res = await api.post('/ai/analyze', { sheet_id: sheetId, question })
  return res.data.insight
}

// ── File memory ──────────────────────────────────────────────────────────────

export interface UploadedFile {
  id: string
  original_name: string
  file_type: string
  file_size: number
  created_at: string
}

export async function uploadFile(file: File): Promise<UploadedFile> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await api.post('/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function listFiles(): Promise<UploadedFile[]> {
  const res = await api.get('/files')
  return res.data
}

export async function deleteFile(fileId: string): Promise<void> {
  await api.delete(`/files/${fileId}`)
}

export async function chatWithFiles(
  message: string,
  fileIds: string[],
): Promise<string> {
  const res = await api.post('/ai/chat', { message, file_ids: fileIds })
  return res.data.answer
}

export default api
