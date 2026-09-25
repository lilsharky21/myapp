'use client';

import { useState } from 'react';
import { upload } from '@vercel/blob/client';

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('');

  const handleSave = async (e) => {
    e.preventDefault();
    if (!file) {
      setStatus('Please pick a file first!');
      return;
    }

    setStatus('Saving to the locker...');

    try {
      const blob = await upload(file.name, file, {
        access: 'public',
        handleUploadUrl: '/api/upload',
      });
      setStatus(`Success! Your file is live at: ${blob.url}`);
    } catch (error) {
      setStatus('Oops, something went wrong.');
    }
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif' }}>
      <h1>My Locker Upload Page</h1>
      <form onSubmit={handleSave}>
        <input 
          type="file" 
          onChange={(e) => setFile(e.target.files[0])} 
        />
        <button type="submit" style={{ padding: '5px 10px', marginLeft: '10px' }}>
          Save to Locker
        </button>
      </form>
      <p style={{ marginTop: '20px', color: 'blue' }}><b>{status}</b></p>
    </div>
  );
}
