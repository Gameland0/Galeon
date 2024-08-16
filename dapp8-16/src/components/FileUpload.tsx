import React, { useState } from 'react';
import { uploadFile } from '../services/api';

interface FileUploadProps {
  agentId: string;
}

const FileUpload: React.FC<FileUploadProps> = ({ agentId }) => {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    try {
      const response = await uploadFile(agentId, file);
      console.log('File uploaded:', response.data);
      setFile(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error uploading file');
    }
  };

  return (
    <div className="file-upload">
      <h3>Upload File</h3>
      <form onSubmit={handleSubmit}>
        <input type="file" onChange={handleFileChange} required />
        <button type="submit">Upload</button>
      </form>
      {error && <p className="error-message">{error}</p>}
    </div>
  );
};

export default FileUpload;
