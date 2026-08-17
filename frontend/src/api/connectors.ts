export interface FilePreview {
  relative_path: string;
  status: 'new' | 'modified' | 'unchanged' | 'deleted';
  tags: string[];
  domain?: string;
  size_bytes: number;
}

export interface ImportPreview {
  vault_name: string;
  total_files: number;
  new_files: number;
  modified_files: number;
  unchanged_files: number;
  deleted_files: number;
  files: FilePreview[];
}

export interface ImportJobState {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  vault_name: string;
  total_files: number;
  processed_files: number;
  imported_count: number;
  modified_count: number;
  skipped_count: number;
  deleted_count: number;
  failed_count: number;
  errors: string[];
  detected_tags: string[];
  detected_domains: string[];
  created_at: string;
  completed_at?: string;
}

const BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api/v1';

export const previewObsidianImport = async (file: File, vaultName: string): Promise<ImportPreview> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('vault_name', vaultName);
  
  const res = await fetch(`${BASE_URL}/connectors/obsidian/preview`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP error! status: ${res.status}`);
  }
  return res.json();
};

export const startObsidianImport = async (file: File, vaultName: string): Promise<ImportJobState> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('vault_name', vaultName);
  
  const res = await fetch(`${BASE_URL}/connectors/obsidian/import`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP error! status: ${res.status}`);
  }
  return res.json();
};

export const getImportStatus = async (jobId: string): Promise<ImportJobState> => {
  const res = await fetch(`${BASE_URL}/connectors/obsidian/import/${jobId}`);
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `HTTP error! status: ${res.status}`);
  }
  return res.json();
};
