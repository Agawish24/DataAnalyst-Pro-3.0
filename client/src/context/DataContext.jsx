import { createContext, useContext, useState, useCallback, useRef } from 'react';
import api from '../api/client';
import toast from 'react-hot-toast';

const DataContext = createContext(null);

export const DataProvider = ({ children }) => {
  const [datasets, setDatasets] = useState([]);
  const [activeDataset, setActiveDataset] = useState(null);
  const [loading, setLoading] = useState(false);
  const fetchingRef = useRef(false);
  const shownErrorRef = useRef(false);

  const fetchDatasets = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      setLoading(true);
      const res = await api.get('/datasets');
      setDatasets(res.data);
      shownErrorRef.current = false;
    } catch (err) {
      if (!shownErrorRef.current) {
        shownErrorRef.current = true;
        toast.error('Failed to load datasets');
      }
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  const uploadDataset = async (file, name) => {
    const formData = new FormData();
    formData.append('file', file);
    if (name) formData.append('name', name);
    const res = await api.post('/datasets/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    setDatasets(prev => [res.data, ...prev]);
    return res.data;
  };

  const deleteDataset = async (id) => {
    await api.delete(`/datasets/${id}`);
    setDatasets(prev => prev.filter(d => d.id !== id));
    if (activeDataset?.id === id) setActiveDataset(null);
  };

  const selectDataset = async (dataset) => {
    try {
      const res = await api.get(`/datasets/${dataset.id}`);
      setActiveDataset(res.data);
    } catch {
      setActiveDataset(dataset);
    }
  };

  return (
    <DataContext.Provider value={{ datasets, activeDataset, selectedDataset: activeDataset, loading, fetchDatasets, uploadDataset, deleteDataset, selectDataset, setActiveDataset }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => useContext(DataContext);
