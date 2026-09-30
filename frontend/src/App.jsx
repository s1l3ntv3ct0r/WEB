import { NavLink, Link, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext.jsx';
import { Notice, Loading } from './components/UI.jsx';
import Icon from './components/Icon.jsx';
import { api, messageOf } from './api/client.js';
import Catalog, { ProductDetail } from './pages/products/Products.jsx';
import AuthPage from './pages/auth/AuthPage.jsx';
import Cart from './pages/cart/Cart.jsx';
import Orders, { OrderDetail } from './pages/orders/Orders.jsx';
import Profile from './pages/profile/Profile.jsx';
import Tickets, { TicketDetail } from './pages/support/Tickets.jsx';
import Admin from './pages/admin/Admin.jsx';

function Guard({ children, admin = false }) {
  const { user, loading } = useAuth(); const location = useLocation();
  if (loading) return <Loading/>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace/>;
  if (admin && user.role !== 'ADMIN') return <Navigate to="/" replace/>;
  return children;
}
function BagLink() {
  const { user } = useAuth(); const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    if (!user) { setCount(0); return; }
    const refresh = () => api.get('/cart').then(({data}) => { if (active) setCount(data.data.items.reduce((sum,item) => sum + item.quantity, 0)); }).catch(() => {});
    refresh(); window.addEventListener('shoplab:cart-updated', refresh);
    return () => { active = false; window.removeEventListener('shoplab:cart-updated', refresh); };
  }, [user?.id]);
  return <NavLink to="/cart" className="bag-link" aria-label={'Shopping bag, ' + count + ' items'}><Icon name="bag"/><span>Bag</span><span className="bag-count">{count}</span></NavLink>;
}
function StoreFooter() {
  return <footer className="store-footer">
    <div className="footer-main">
      <div className="footer-story"><Link to="/" className="brand">shoplab<span className="brand-dot">.</span></Link><h2>A little less ordinary.<br/>A little more you.</h2><p>Good design belongs in your everyday.<br/>Discover things you’ll reach for, again and again.</p></div>
      <div className="footer-column"><h3>The collection</h3>{['Audio','Workspace','Everyday','Lifestyle'].map(category => <Link key={category} to={'/products?category=' + category}>{category}</Link>)}</div>
      <div className="footer-column"><h3>Your ShopLab</h3><Link to="/profile">My account</Link><Link to="/orders">Track your orders</Link><Link to="/support">Contact support</Link><Link to="/cart">Shopping bag</Link></div>
      <div className="footer-note"><Icon name="leaf" size={27}/><h3>Choose with intention.</h3><p>Useful objects. Thoughtful details.<br/>A quieter kind of everyday.</p><span>Designed for daily life.</span></div>
    </div>
    <div className="footer-bottom"><span>© {new Date().getFullYear()} ShopLab. An independent collection.</span><span>Vietnam / VND ₫</span></div>
  </footer>;
}
export default function App() {
  const { user, signOut } = useAuth(); const [error, setError] = useState('');
  return <>
    <a className="skip-link" href="#main-content">Skip to content</a>
    <div className="announcement"><span className="announcement-side">EVERYDAY, WELL CONSIDERED.</span><span className="announcement-center"><Icon name="truck" size={15}/> Complimentary delivery on all orders</span><span className="announcement-side">VIETNAM · VND ₫</span></div>
    <header className="store-header">
      <Link to="/" className="brand" aria-label="ShopLab home">shoplab<span className="brand-dot">.</span></Link>
      <nav aria-label="Main navigation"><NavLink to="/products">Collection</NavLink><Link to="/products?category=Workspace">For your workspace</Link>{user && <><NavLink to="/orders">Orders</NavLink><NavLink to="/support">Support</NavLink>{user.role === 'ADMIN' && <NavLink to="/admin">Admin</NavLink>}</>}</nav>
      <div className="nav-right"><Link className="header-search" to="/products#collection" aria-label="Search the collection"><Icon name="search"/></Link>{user ? <><NavLink to="/profile" className="account-link"><Icon name="user"/><span>{user.username}</span></NavLink><button className="text-button signout-link" onClick={() => signOut().catch(e => setError(messageOf(e)))}>Sign out</button></> : <NavLink className="account-link" to="/login"><Icon name="user"/><span>Sign in</span></NavLink>}<BagLink/></div>
    </header>
    <main id="main-content"><Notice>{error}</Notice><Routes>
      <Route path="/" element={<Catalog home/>}/><Route path="/products" element={<Catalog/>}/><Route path="/products/:id" element={<ProductDetail/>}/>
      {['login', 'register', 'forgot-password', 'reset-password'].map(mode => <Route key={mode} path={'/' + mode} element={<AuthPage key={mode} mode={mode}/>}/>)}
      <Route path="/cart" element={<Guard><Cart/></Guard>}/><Route path="/orders" element={<Guard><Orders/></Guard>}/><Route path="/orders/:id" element={<Guard><OrderDetail/></Guard>}/><Route path="/profile" element={<Guard><Profile/></Guard>}/><Route path="/support" element={<Guard><Tickets/></Guard>}/><Route path="/support/:id" element={<Guard><TicketDetail/></Guard>}/><Route path="/admin/*" element={<Guard admin><Admin/></Guard>}/><Route path="*" element={<section className="empty"><h1>Page not found</h1><Link to="/">Back to the collection →</Link></section>}/>
    </Routes></main><StoreFooter/>
  </>;
}
