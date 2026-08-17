import React, { useState, useRef, useEffect } from 'react';
import { ImportJobState, ImportPreview, previewObsidianImport, startObsidianImport, getImportStatus } from '../../api/connectors';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export const ObsidianImportModal: React.FC<Props> = ({ isOpen, onClose, onComplete }) => {
  const [vaultName, setVaultName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [job, setJob] = useState<ImportJobState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let interval: number;
    if (job && (job.status === 'pending' || job.status === 'processing')) {
      interval = window.setInterval(async () => {
        try {
          const updatedJob = await getImportStatus(job.id);
          setJob(updatedJob);
          if (updatedJob.status === 'completed' || updatedJob.status === 'failed') {
            clearInterval(interval);
            if (updatedJob.status === 'completed') {
              onComplete();
            }
          }
        } catch (e: any) {
          console.error("Failed to poll status", e);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [job, onComplete]);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    
    if (!selected.name.endsWith('.zip')) {
      setError("Please select a .zip file");
      return;
    }
    
    setFile(selected);
    setError(null);
    setPreview(null);
    
    if (!vaultName) {
      setVaultName(selected.name.replace('.zip', ''));
    }
  };

  const handleGeneratePreview = async () => {
    if (!file || !vaultName) return;
    setIsLoading(true);
    setError(null);
    try {
      const p = await previewObsidianImport(file, vaultName);
      setPreview(p);
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || "Failed to generate preview");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartImport = async () => {
    if (!file || !vaultName) return;
    setIsLoading(true);
    setError(null);
    try {
      const j = await startObsidianImport(file, vaultName);
      setJob(j);
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || "Failed to start import");
    } finally {
      setIsLoading(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setPreview(null);
    setJob(null);
    setVaultName('');
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    if (job && (job.status === 'pending' || job.status === 'processing')) {
      if (!window.confirm("Import is still running in the background. Are you sure you want to close this window?")) {
        return;
      }
    }
    resetState();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b flex justify-between items-center bg-gray-50">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <span>Import Obsidian Vault</span>
          </h2>
          <button onClick={handleClose} className="text-gray-500 hover:text-gray-700">
            &times;
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 bg-red-100 text-red-700 rounded border border-red-200">
              {error}
            </div>
          )}

          {!job ? (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vault Name
                </label>
                <input
                  type="text"
                  value={vaultName}
                  onChange={(e) => setVaultName(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                  placeholder="My Obsidian Vault"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vault Archive (.zip)
                </label>
                <div 
                  className="border-2 border-dashed border-gray-300 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept=".zip"
                    onChange={handleFileChange}
                  />
                  {file ? (
                    <div className="text-center">
                      <p className="font-medium text-blue-600">{file.name}</p>
                      <p className="text-sm text-gray-500">{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500">
                      <p>Click to select or drag and drop a ZIP file</p>
                      <p className="text-sm mt-1">Make sure it contains .md files</p>
                    </div>
                  )}
                </div>
              </div>

              {file && !preview && (
                <div className="flex justify-end">
                  <button 
                    onClick={handleGeneratePreview} 
                    disabled={isLoading || !vaultName}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isLoading ? 'Generating Preview...' : 'Analyze Vault'}
                  </button>
                </div>
              )}

              {preview && (
                <div className="border rounded-lg p-4 bg-gray-50">
                  <h3 className="font-semibold text-lg mb-3">Import Preview</h3>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="bg-white p-3 rounded shadow-sm border">
                      <div className="text-sm text-gray-500">Total Files</div>
                      <div className="text-xl font-bold">{preview.total_files}</div>
                    </div>
                    <div className="bg-green-50 p-3 rounded shadow-sm border border-green-200">
                      <div className="text-sm text-green-700">New</div>
                      <div className="text-xl font-bold text-green-700">{preview.new_files}</div>
                    </div>
                    <div className="bg-yellow-50 p-3 rounded shadow-sm border border-yellow-200">
                      <div className="text-sm text-yellow-700">Modified</div>
                      <div className="text-xl font-bold text-yellow-700">{preview.modified_files}</div>
                    </div>
                    <div className="bg-red-50 p-3 rounded shadow-sm border border-red-200">
                      <div className="text-sm text-red-700">Deleted</div>
                      <div className="text-xl font-bold text-red-700">{preview.deleted_files}</div>
                    </div>
                  </div>
                  
                  <div className="flex justify-end mt-4">
                    <button 
                      onClick={handleStartImport}
                      disabled={isLoading}
                      className="bg-green-600 text-white px-6 py-2 rounded font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      {isLoading ? 'Starting...' : 'Start Import'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-xl font-bold mb-2">
                  {job.status === 'processing' && 'Importing Vault...'}
                  {job.status === 'completed' && 'Import Completed!'}
                  {job.status === 'failed' && 'Import Failed'}
                  {job.status === 'pending' && 'Preparing...'}
                </h3>
                
                {job.status === 'processing' && (
                  <div className="w-full bg-gray-200 rounded-full h-4 mb-2 mt-4">
                    <div 
                      className="bg-blue-600 h-4 rounded-full transition-all duration-500" 
                      style={{ width: `${Math.max(5, (job.processed_files / job.total_files) * 100)}%` }}
                    ></div>
                  </div>
                )}
                
                <p className="text-gray-600">
                  Processed {job.processed_files} of {job.total_files} files
                </p>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="border rounded p-3 text-center">
                  <div className="text-2xl font-bold text-green-600">{job.imported_count}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Imported</div>
                </div>
                <div className="border rounded p-3 text-center">
                  <div className="text-2xl font-bold text-blue-600">{job.modified_count}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Modified</div>
                </div>
                <div className="border rounded p-3 text-center">
                  <div className="text-2xl font-bold text-gray-600">{job.skipped_count}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Skipped</div>
                </div>
                <div className="border rounded p-3 text-center">
                  <div className="text-2xl font-bold text-red-600">{job.deleted_count}</div>
                  <div className="text-xs text-gray-500 uppercase tracking-wide">Deleted</div>
                </div>
              </div>

              {job.detected_tags.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">Detected Tags:</h4>
                  <div className="flex flex-wrap gap-2">
                    {job.detected_tags.slice(0, 15).map(t => (
                      <span key={t} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded border">{t}</span>
                    ))}
                    {job.detected_tags.length > 15 && (
                      <span className="px-2 py-1 text-gray-500 text-xs">+{job.detected_tags.length - 15} more</span>
                    )}
                  </div>
                </div>
              )}

              {job.errors.length > 0 && (
                <div className="mt-4 p-4 border border-red-200 bg-red-50 rounded text-sm text-red-800 max-h-40 overflow-y-auto">
                  <h4 className="font-bold mb-1">Errors ({job.failed_count}):</h4>
                  <ul className="list-disc pl-5 space-y-1">
                    {job.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}

              {job.status === 'completed' && (
                <div className="flex justify-end mt-6">
                  <button onClick={handleClose} className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">
                    Close & Refresh
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
