import { useEffect, useState } from 'react';
import { api, messageOf } from '../api/client.js';
import { productImage } from '../data/productImages.js';
import Icon from './Icon.jsx';
export function useLoad(url) {
  const [data, setData] = useState(null); const [error, setError] = useState(''); const [version, bump] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError('');
    api.get(url, { signal: controller.signal }).then(r => setData(r.data.data)).catch(e => { if (e.code !== 'ERR_CANCELED') setError(messageOf(e)); });
    return () => controller.abort();
  }, [url, version]);
  return { data, error, reload: () => bump(x => x + 1) };
}
export function Notice({ children, success = false }) { return children ? <div className={`notice ${success ? 'success' : ''}`} role={success ? 'status' : 'alert'}>{children}</div> : null; }
export function Loading() { return <div className="loading" role="status">Loading your space…</div>; }
export function Empty({ title, children }) { return <div className="empty"><span className="empty-mark">↗</span><h2>{title}</h2><p>{children}</p></div>; }
export function Field({ label, children, ...props }) { return <label className="field"><span>{label}</span>{children || <input {...props}/>}</label>; }
export function Pager({ data, setPage }) { return data && data.total > data.limit ? <div className="pager"><button disabled={data.page === 1} onClick={() => setPage(data.page - 1)}>← Previous</button><span>{data.page} / {Math.ceil(data.total / data.limit)}</span><button disabled={data.page * data.limit >= data.total} onClick={() => setPage(data.page + 1)}>Next →</button></div> : null; }
export function Status({ value }) { return <span className={`status status-${value?.toLowerCase()}`}>{value?.replaceAll('_', ' ')}</span>; }
export function ProductArt({ product, large = false }) {
  const src = productImage(product);
  const [failedSource, setFailedSource] = useState(null);
  return <div className={`product-art ${large ? 'large' : ''}`}>
    {src && failedSource !== src ? <img src={src} alt={product.name} loading={large ? 'eager' : 'lazy'} decoding="async" width="800" height="800" onError={() => setFailedSource(src)}/> : <div className="image-placeholder"><Icon name="box" size={36}/><span>Image unavailable</span></div>}
  </div>;
}
