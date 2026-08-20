// ===== Firebase setup =====
const firebaseConfig = {
  apiKey: "AIzaSyC_nI9BSfWN7gpHi4G_KNCZQctw9gVzRpo",
  authDomain: "phancy-styles.firebaseapp.com",
  projectId: "phancy-styles",
  storageBucket: "phancy-styles.firebasestorage.app",
  messagingSenderId: "938653962217",
  appId: "1:938653962217:web:627f26d48313a743ac4578"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const productsCollection = db.collection('products');
const ordersCollection = db.collection('orders');
const adminsCollection = db.collection('admins');
const loginsCollection = db.collection('logins');
const clientsCollection = db.collection('clients');

// ===== Cloudinary config (unsigned upload preset — safe to expose in frontend code) =====
const CLOUDINARY_CLOUD_NAME = 't7eiohic';
const CLOUDINARY_UPLOAD_PRESET = 'phancy_styles';

const pageName = window.location.pathname.split('/').pop() || 'index.html';
if (pageName === 'admin.html') {
  window.location.href = 'admin-control.html';
}

const showElement = (el) => el && el.classList.remove('hidden');
const hideElement = (el) => el && el.classList.add('hidden');

// Escape any user-supplied text before inserting it into innerHTML,
// to prevent stored XSS from product fields, emails, etc.
const escapeHtml = (value) => {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

let activeCategory = 'All';
let currentUser = null;
let isAdmin = false;
let cachedProducts = [];
let cachedOrders = [];
let unsubscribeOrders = null;
let clientProfileLoaded = false;
let loginsSubscribed = false;

// Record a login event so admins can see recent site activity.
const logLoginEvent = async (email, role) => {
  try {
    await loginsCollection.add({
      email,
      role,
      loggedInAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (error) {
    console.error('Could not record login event:', error);
  }
};

const categoryLabels = {
  'Women Clothing': "Women's Clothing",
  'Women Shoes': "Women's Shoes",
  'Men Clothing': "Men's Clothing",
  'Men Shoes': "Men's Shoes",
  'Children': 'Children',
  'All': 'All Products'
};

// ===== Cart (stays per-browser in localStorage; not account-tied) =====
const getCart = () => {
  const stored = localStorage.getItem('phancyCart');
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
};

const saveCart = (cart) => {
  localStorage.setItem('phancyCart', JSON.stringify(cart));
};

// ===== Auth badges =====
const updateUserBadge = () => {
  const badge = document.getElementById('user-email-badge');
  if (!badge) return;
  badge.textContent = currentUser ? `Logged in as ${currentUser.email}` : '';
};

const updateAdminBadge = () => {
  const badge = document.getElementById('admin-email-badge');
  if (!badge) return;
  badge.textContent = currentUser && isAdmin ? `Admin: ${currentUser.email}` : '';
};

// ===== Products =====
const getCategoryCounts = (products) => {
  const counts = {
    All: products.length,
    'Women Clothing': 0,
    'Women Shoes': 0,
    'Men Clothing': 0,
    'Men Shoes': 0,
    Children: 0
  };
  products.forEach((product) => {
    if (counts[product.category] !== undefined) {
      counts[product.category] += 1;
    }
  });
  return counts;
};

const renderCategoryCounts = () => {
  const counts = getCategoryCounts(cachedProducts);
  const cards = document.querySelectorAll('.category-card');
  cards.forEach((card) => {
    const category = card.dataset.category;
    const label = categoryLabels[category] || category;
    const count = counts[category] ?? 0;
    card.textContent = `${label} (${count})`;
  });
};

const filterProductsList = (products, category) => {
  if (category === 'All') return products;
  return products.filter((product) => product.category === category);
};

const renderAdminInventory = () => {
  const list = document.getElementById('inventory-list');
  const countsBox = document.getElementById('category-counts');
  const counts = getCategoryCounts(cachedProducts);
  if (countsBox) {
    countsBox.innerHTML = Object.keys(categoryLabels)
      .map((category) => `<div class="inventory-count-item"><strong>${categoryLabels[category]}</strong>: ${counts[category]}</div>`)
      .join('');
  }
  if (!list) return;
  if (!cachedProducts.length) {
    list.innerHTML = '<p>No products available yet.</p>';
    return;
  }
  list.innerHTML = cachedProducts
    .map((product) => `
      <div class="inventory-row">
        <div class="inventory-summary">
          <strong>${escapeHtml(product.name)}</strong>
          <span>${escapeHtml(product.category)} · ${escapeHtml(product.condition)} · ${escapeHtml(product.size)}${product.type ? ' · ' + escapeHtml(product.type) : ''}</span>
          <p>${escapeHtml(product.description) || 'No description'}</p>
        </div>
        <div class="inventory-actions">
          <span>KES ${product.price}</span>
          <button class="btn btn-secondary btn-remove-admin" data-product-id="${product.id}">Remove</button>
        </div>
      </div>
    `)
    .join('');
  attachAdminRemoveButtons();
};

const attachAdminRemoveButtons = () => {
  document.querySelectorAll('.btn-remove-admin').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.dataset.productId;
      try {
        await productsCollection.doc(id).delete();
      } catch (error) {
        alert('Could not remove product: ' + error.message);
      }
    });
  });
};

const createProductCard = (product) => {
  const article = document.createElement('article');
  article.className = 'product-card';
  const hasImage = Boolean(product.imageUrl);
  const safeImageUrl = escapeHtml(product.imageUrl);
  const imageStyle = hasImage ? `background: url('${safeImageUrl}') center/cover no-repeat;` : '';
  const imageClass = hasImage ? 'product-image' : 'product-image no-image';
  article.innerHTML = `
    <div class="${imageClass}" style="${imageStyle}">${hasImage ? '' : 'No image available'}</div>
    <h3>${escapeHtml(product.name)}</h3>
    <p>KES ${product.price}</p>
    <div class="product-meta">${escapeHtml(product.condition)} · ${escapeHtml(product.size)}${product.type ? ' · ' + escapeHtml(product.type) : ''}</div>
    <div class="card-actions">
      <button class="btn btn-add" data-product-id="${product.id}">Add to Cart</button>
    </div>
  `;
  return article;
};

const renderProducts = (products) => {
  const grid = document.getElementById('product-grid');
  if (!grid) return;
  grid.innerHTML = '';
  if (!products.length) {
    grid.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:#475569;">No products match this category yet.</p>';
    return;
  }
  products.forEach((product) => {
    grid.appendChild(createProductCard(product));
  });
  attachCartButtons();
};

const attachCartButtons = () => {
  document.querySelectorAll('.btn-add').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.productId;
      const product = cachedProducts.find((item) => item.id === id);
      if (!product) return;
      const cart = getCart();
      const existing = cart.find((item) => item.id === id);
      if (existing) {
        existing.quantity += 1;
      } else {
        cart.push({ ...product, quantity: 1 });
      }
      saveCart(cart);
      renderCart();
    });
  });
};

const renderCart = () => {
  const cartGrid = document.getElementById('cart-grid');
  const totalLabel = document.getElementById('checkout-total');
  const cart = getCart();
  if (!cartGrid || !totalLabel) return;
  cartGrid.innerHTML = '';
  if (!cart.length) {
    cartGrid.innerHTML = '<p style="color:#475569;">Your cart is empty. Add clothes or shoes from the product list.</p>';
    totalLabel.textContent = 'Total: KES 0';
    return;
  }
  let total = 0;
  cart.forEach((item) => {
    total += item.price * item.quantity;
    const itemRow = document.createElement('div');
    itemRow.className = 'cart-item';
    itemRow.innerHTML = `
      <div>
        <h3>${escapeHtml(item.name)}</h3>
        <p>${item.quantity} x KES ${item.price}</p>
      </div>
      <div class="cart-actions">
        <button class="btn btn-secondary btn-remove" data-product-id="${item.id}">Remove</button>
      </div>
    `;
    cartGrid.appendChild(itemRow);
  });
  totalLabel.textContent = `Total: KES ${total}`;
  attachRemoveButtons();
};

const attachRemoveButtons = () => {
  document.querySelectorAll('.btn-remove').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.productId;
      let cart = getCart();
      cart = cart.filter((item) => item.id !== id);
      saveCart(cart);
      renderCart();
    });
  });
};

const setupCategoryFilters = () => {
  const cards = document.querySelectorAll('.category-card');
  cards.forEach((card) => {
    if (card.dataset.category === activeCategory) {
      card.classList.add('active');
    }
    card.addEventListener('click', () => {
      cards.forEach((item) => item.classList.remove('active'));
      card.classList.add('active');
      activeCategory = card.dataset.category;
      renderProducts(filterProductsList(cachedProducts, activeCategory));
      document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
    });
  });
};

// Render the four stat cards at the top of admin-dashboard.html.
const renderDashboardStats = () => {
  const box = document.getElementById('dashboard-stats');
  if (!box) return;
  const totalOrders = cachedOrders.length;
  const revenue = cachedOrders.reduce((sum, order) => sum + (order.total || 0), 0);
  const pending = cachedOrders.filter((order) => (order.status || 'pending') === 'pending').length;
  box.innerHTML = `
    <div class="stat-card"><h3>Total Orders</h3><div class="number">${totalOrders}</div></div>
    <div class="stat-card"><h3>Revenue (KES)</h3><div class="number">${revenue.toLocaleString()}</div></div>
    <div class="stat-card"><h3>Products Listed</h3><div class="number">${cachedProducts.length}</div></div>
    <div class="stat-card"><h3>Pending Orders</h3><div class="number">${pending}</div></div>
  `;
};

const isAdminPage = () =>
  pageName === 'admin.html' || pageName === 'admin-control.html' || pageName === 'admin-dashboard.html';

// Live product feed — every visitor sees admin changes in real time, no polling needed.
productsCollection.orderBy('createdAt', 'desc').onSnapshot(
  (snapshot) => {
    cachedProducts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderCategoryCounts();
    if (pageName === '' || pageName === 'index.html') {
      renderProducts(filterProductsList(cachedProducts, activeCategory));
    }
    if (isAdminPage()) {
      renderAdminInventory();
      renderDashboardStats();
    }
  },
  (error) => console.error('Failed to load products:', error)
);

// Recent site logins, visible only to admins (enforced by Firestore rules too).
const renderRecentLogins = (logins) => {
  const list = document.getElementById('recent-logins-list');
  if (!list) return;
  if (!logins.length) {
    list.innerHTML = '<tr><td colspan="3">No login activity yet.</td></tr>';
    return;
  }
  list.innerHTML = logins
    .map((entry) => {
      const when = entry.loggedInAt?.toDate ? entry.loggedInAt.toDate().toLocaleString() : 'Just now';
      return `<tr><td>${escapeHtml(entry.email)}</td><td>${escapeHtml(entry.role)}</td><td>${escapeHtml(when)}</td></tr>`;
    })
    .join('');
};

const subscribeRecentLogins = () => {
  if (loginsSubscribed) return;
  loginsSubscribed = true;
  loginsCollection.orderBy('loggedInAt', 'desc').limit(20).onSnapshot(
    (snapshot) => renderRecentLogins(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))),
    (error) => console.error('Failed to load recent logins:', error)
  );
};

// ===== Orders =====
const renderMyOrders = () => {
  const list = document.getElementById('my-orders-list');
  if (!list) return;
  if (!currentUser) {
    list.innerHTML = '<p style="color:#475569;">Log in to see your orders.</p>';
    return;
  }
  if (!cachedOrders.length) {
    list.innerHTML = '<p style="color:#475569;">You have no orders yet.</p>';
    return;
  }
  list.innerHTML = cachedOrders
    .map((order) => `
      <div class="order-card">
        <h4>Order #${order.id}</h4>
        <p><strong>Status:</strong> ${escapeHtml((order.status || 'pending').toUpperCase())}</p>
        <p><strong>M-PESA Code:</strong> ${escapeHtml(order.mpesaCode) || 'Not provided'}</p>
        <p><strong>Total:</strong> KES ${order.total}</p>
        <div class="order-items">
          ${(order.items || []).map((item) => `<div class="order-item"><span>${escapeHtml(item.name)} x ${item.quantity}</span><span>KES ${item.price}</span></div>`).join('')}
        </div>
      </div>
    `)
    .join('');
};

const updateOrderStatus = async (orderId, newStatus) => {
  try {
    await ordersCollection.doc(orderId).update({ status: newStatus });
  } catch (error) {
    alert('Could not update order: ' + error.message);
  }
};

const attachOrderStatusButtons = () => {
  document.querySelectorAll('.btn-confirm-order').forEach((btn) => {
    btn.addEventListener('click', () => updateOrderStatus(btn.dataset.orderId, 'confirmed'));
  });
  document.querySelectorAll('.btn-shipped-order').forEach((btn) => {
    btn.addEventListener('click', () => updateOrderStatus(btn.dataset.orderId, 'shipped'));
  });
};

const renderAdminOrders = () => {
  const list = document.getElementById('order-list');
  const countsBox = document.getElementById('order-counts');
  if (countsBox) {
    const pendingCount = cachedOrders.filter((o) => o.status === 'pending').length;
    const confirmedCount = cachedOrders.filter((o) => o.status === 'confirmed').length;
    const shippedCount = cachedOrders.filter((o) => o.status === 'shipped').length;
    countsBox.innerHTML = `
      <div class="inventory-count-item"><strong>Pending</strong>: ${pendingCount}</div>
      <div class="inventory-count-item"><strong>Confirmed</strong>: ${confirmedCount}</div>
      <div class="inventory-count-item"><strong>Shipped</strong>: ${shippedCount}</div>
    `;
  }
  if (!list) return;
  if (!cachedOrders.length) {
    list.innerHTML = '<p>No orders yet.</p>';
    return;
  }
  list.innerHTML = cachedOrders
    .map((order) => {
      const status = order.status || 'pending';
      const statusButtons = status === 'pending'
        ? `<button class="btn btn-primary btn-confirm-order" data-order-id="${order.id}">Confirm Order</button>`
        : status === 'confirmed'
        ? `<button class="btn btn-primary btn-shipped-order" data-order-id="${order.id}">Mark as Shipped</button>`
        : `<span style="color:#059669; font-weight:bold;">✓ Shipped</span>`;
      return `
        <div class="order-card">
          <h4>Order #${order.id}</h4>
          <p><strong>Placed by:</strong> ${escapeHtml(order.clientEmail)}</p>
          <p><strong>Payment method:</strong> ${escapeHtml(order.paymentMethod)}</p>
          <p><strong>M-PESA Code:</strong> <span style="font-family:monospace; font-weight:bold; background:#f0f0f0; padding:2px 6px; border-radius:4px;">${escapeHtml(order.mpesaCode) || 'Not provided'}</span></p>
          <p><strong>Total:</strong> KES ${order.total}</p>
          <p><strong>Status:</strong> <span style="font-weight:bold; color:#0284c7;">${escapeHtml(status.toUpperCase())}</span></p>
          <div class="order-items">
            ${(order.items || []).map((item) => `<div class="order-item"><span>${escapeHtml(item.name)} x ${item.quantity}</span><span>KES ${item.price}</span></div>`).join('')}
          </div>
          <div style="margin-top:10px; display:flex; gap:10px;">${statusButtons}</div>
        </div>
      `;
    })
    .join('');
  attachOrderStatusButtons();
};

const subscribeOrders = () => {
  if (unsubscribeOrders) {
    unsubscribeOrders();
    unsubscribeOrders = null;
  }
  if (!currentUser) {
    cachedOrders = [];
    renderMyOrders();
    if (pageName === 'admin.html' || pageName === 'admin-control.html') renderAdminOrders();
    return;
  }
  const query = isAdmin
    ? ordersCollection.orderBy('placedAt', 'desc')
    : ordersCollection.where('uid', '==', currentUser.uid).orderBy('placedAt', 'desc');

  unsubscribeOrders = query.onSnapshot(
    (snapshot) => {
      cachedOrders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      if (isAdmin) renderAdminOrders();
      if (isAdmin && pageName === 'admin-dashboard.html') renderDashboardStats();
      renderMyOrders();
    },
    (error) => console.error('Failed to load orders:', error)
  );
};

// ===== Auth state =====
auth.onAuthStateChanged(async (user) => {
  currentUser = user;
  isAdmin = false;
  if (user) {
    try {
      const adminDoc = await adminsCollection.doc(user.uid).get();
      isAdmin = adminDoc.exists;
    } catch (error) {
      console.error('Could not check admin status:', error);
    }
  }
  updateUserBadge();
  updateAdminBadge();
  subscribeOrders();

  if (pageName === 'client-login.html' && currentUser) {
    window.location.href = 'index.html';
  }

  if (pageName === 'admin.html' || pageName === 'admin-control.html') {
    const adminDashboard = document.querySelector('.admin-dashboard');
    const adminLoginCard = document.querySelector('.admin-panel');
    const adminMessageBox = document.getElementById('admin-access-message');
    if (currentUser && isAdmin) {
      showElement(adminDashboard);
      hideElement(adminLoginCard);
      renderAdminInventory();
      renderAdminOrders();
      renderCategoryCounts();
    } else {
      hideElement(adminDashboard);
      showElement(adminLoginCard);
      if (currentUser && !isAdmin && adminMessageBox) {
        adminMessageBox.textContent = 'This account does not have admin access.';
      }
    }
  }

  // Full admin dashboard is a standalone page (no login form on it) —
  // bounce non-admins back to admin-login.html.
  if (pageName === 'admin-dashboard.html') {
    if (!currentUser || !isAdmin) {
      window.location.href = 'admin-login.html';
    } else {
      renderAdminInventory();
      renderAdminOrders();
      renderCategoryCounts();
      renderDashboardStats();
      subscribeRecentLogins();
    }
  }

  // Client account page — bounce signed-out visitors to the login page.
  if (pageName === 'client-dashboard.html') {
    if (!currentUser) {
      window.location.href = 'client-login.html';
    } else {
      const welcomeMsg = document.getElementById('welcome-message');
      if (welcomeMsg) welcomeMsg.textContent = `Welcome, ${currentUser.email}!`;
      const profileEmailInput = document.getElementById('profile-email');
      if (profileEmailInput) profileEmailInput.value = currentUser.email;
      if (!clientProfileLoaded) {
        clientProfileLoaded = true;
        clientsCollection
          .doc(currentUser.uid)
          .get()
          .then((doc) => {
            const phoneInput = document.getElementById('profile-phone');
            if (phoneInput && doc.exists) phoneInput.value = doc.data().phone || '';
          })
          .catch((error) => console.error('Could not load profile:', error));
      }
    }
  }
});

// ===== Storefront page (index.html) =====
if (pageName === '' || pageName === 'index.html') {
  renderCart();
  setupCategoryFilters();
  updateUserBadge();

  const placeOrderBtn = document.getElementById('place-order-btn');
  if (placeOrderBtn) {
    const paymentMethodSelect = document.getElementById('payment-method');
    const mpesaCodeInput = document.getElementById('mpesa-code');
    placeOrderBtn.addEventListener('click', async () => {
      const cart = getCart();
      if (!cart.length) {
        alert('Your cart is empty. Add items before placing an order.');
        return;
      }
      if (!currentUser) {
        window.location.href = 'client-login.html';
        return;
      }
      const mpesaCode = mpesaCodeInput?.value.trim().toUpperCase() || '';
      if (!mpesaCode) {
        alert('Please enter the M-PESA confirmation code from your payment before placing the order.');
        mpesaCodeInput?.focus();
        return;
      }
      const paymentMethod = paymentMethodSelect?.value || 'M-PESA';
      try {
        await ordersCollection.add({
          uid: currentUser.uid,
          clientEmail: currentUser.email,
          paymentMethod,
          mpesaCode,
          total: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
          status: 'pending',
          items: cart.map((item) => ({ id: item.id, name: item.name, quantity: item.quantity, price: item.price })),
          placedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        saveCart([]);
        renderCart();
        if (mpesaCodeInput) mpesaCodeInput.value = '';
        alert(`Your order has been placed using ${paymentMethod}. Thank you!`);
      } catch (error) {
        alert('Could not place order: ' + error.message);
      }
    });
  }
}

// ===== Client login / signup page =====
if (pageName === 'client-login.html') {
  const loginForm = document.querySelector('.client-login-form');
  const signupFormElement = document.querySelector('.client-signup-form');
  const signupToggle = document.querySelector('.btn-toggle-signup');

  const setFormMessage = (formEl, message, type = 'error') => {
    if (!formEl) return;
    const box = formEl.querySelector('.signup-messages');
    if (box) {
      box.textContent = message;
      box.classList.remove('error', 'success');
      box.classList.add(type);
    } else {
      console[type === 'error' ? 'error' : 'log'](message);
    }
  };

  const clearFormMessage = (formEl) => {
    if (!formEl) return;
    const box = formEl.querySelector('.signup-messages');
    if (box) box.textContent = '';
  };

  if (signupToggle && signupFormElement) {
    signupToggle.addEventListener('click', () => {
      const show = signupFormElement.classList.contains('hidden');
      if (show) {
        signupFormElement.classList.remove('hidden');
        signupToggle.textContent = 'Back to Sign In';
      } else {
        signupFormElement.classList.add('hidden');
        signupToggle.textContent = 'Create Account';
      }
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFormMessage(loginForm);
      const emailInput = loginForm.querySelector('input[name="client-email"]');
      const passwordInput = loginForm.querySelector('input[type="password"]');
      const email = emailInput?.value.trim() || '';
      const password = passwordInput?.value || '';
      try {
        await auth.signInWithEmailAndPassword(email, password);
        await logLoginEvent(email, 'client');
        window.location.href = 'index.html';
      } catch (error) {
        setFormMessage(loginForm, error.message, 'error');
      }
    });
  }

  if (signupFormElement) {
    signupFormElement.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFormMessage(signupFormElement);
      const passwords = signupFormElement.querySelectorAll('input[type="password"]');
      if (passwords.length < 2) {
        setFormMessage(signupFormElement, 'Please provide a password and confirmation.', 'error');
        return;
      }
      if (passwords[0].value !== passwords[1].value) {
        setFormMessage(signupFormElement, 'Passwords do not match.', 'error');
        passwords[0].focus();
        return;
      }
      const emailInput = signupFormElement.querySelector('input[name="client-email"]');
      const email = emailInput?.value.trim() || '';
      if (!email) {
        setFormMessage(signupFormElement, 'Email is required.', 'error');
        emailInput?.focus();
        return;
      }
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        setFormMessage(signupFormElement, 'Enter a valid email address.', 'error');
        emailInput?.focus();
        return;
      }
      try {
        await auth.createUserWithEmailAndPassword(email, passwords[0].value);
        await logLoginEvent(email, 'client (new account)');
        setFormMessage(signupFormElement, 'Account created — redirecting...', 'success');
        setTimeout(() => {
          window.location.href = 'index.html';
        }, 700);
      } catch (error) {
        setFormMessage(signupFormElement, error.message, 'error');
      }
    });
  }
}

// ===== Admin page =====
if (pageName === 'admin.html' || pageName === 'admin-control.html') {
  const adminLoginForm = document.querySelector('.admin-login-form');
  const logoutButton = document.querySelector('.btn-logout');
  const stockForm = document.querySelector('.stock-form');
  const adminMessageBox = document.getElementById('admin-access-message');

  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (adminMessageBox) adminMessageBox.textContent = '';
      const emailInput = adminLoginForm.querySelector('input[name="admin-email"]');
      const passwordInput = adminLoginForm.querySelector('input[type="password"]');
      const email = emailInput?.value.trim() || '';
      const password = passwordInput?.value || '';
      try {
        const credential = await auth.signInWithEmailAndPassword(email, password);
        const adminDoc = await adminsCollection.doc(credential.user.uid).get();
        if (!adminDoc.exists) {
          if (adminMessageBox) adminMessageBox.textContent = 'This account does not have admin access.';
          await auth.signOut();
        } else {
          await logLoginEvent(email, 'admin');
        }
      } catch (error) {
        if (adminMessageBox) adminMessageBox.textContent = error.message;
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', () => auth.signOut());
  }

  // --- Cloudinary image upload ---
  const uploadImageInput = document.getElementById('upload-image');
  const imageUrlInput = document.getElementById('image-url');
  const uploadStatus = document.getElementById('upload-status');
  const imagePreview = document.getElementById('image-preview');
  let uploadInProgress = false;

  const showImagePreview = (url) => {
    if (!imagePreview) return;
    if (!url) {
      imagePreview.innerHTML = '';
      return;
    }
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Product preview';
    img.style.cssText = 'max-width:200px;max-height:200px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);';
    img.onerror = () => {
      imagePreview.innerHTML = '<p style="color:#dc3545;">❌ Image URL not found</p>';
    };
    imagePreview.innerHTML = '';
    imagePreview.appendChild(img);
  };

  if (imageUrlInput) {
    imageUrlInput.addEventListener('input', (e) => showImagePreview(e.target.value));
  }

  if (uploadImageInput) {
    uploadImageInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      uploadInProgress = true;
      if (uploadStatus) {
        uploadStatus.textContent = '⏳ Uploading to Cloudinary...';
        uploadStatus.style.color = '#666';
      }

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

        const response = await fetch(
          `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
          { method: 'POST', body: formData }
        );

        if (!response.ok) {
          const errBody = await response.json().catch(() => null);
          throw new Error(errBody?.error?.message || `Upload failed (${response.status})`);
        }

        const data = await response.json();
        if (imageUrlInput) imageUrlInput.value = data.secure_url;
        showImagePreview(data.secure_url);
        if (uploadStatus) {
          uploadStatus.textContent = '✓ Uploaded successfully';
          uploadStatus.style.color = '#28a745';
        }
      } catch (error) {
        console.error('Cloudinary upload failed:', error);
        if (uploadStatus) {
          uploadStatus.textContent = `❌ Upload failed: ${error.message}`;
          uploadStatus.style.color = '#dc3545';
        }
      } finally {
        uploadInProgress = false;
      }
    });
  }

  if (stockForm) {
    stockForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (!isAdmin) {
        alert('Admin access required.');
        return;
      }
      if (uploadInProgress) {
        alert('Please wait for the image upload to finish before adding stock.');
        return;
      }

      const formData = new FormData(stockForm);
      const name = formData.get('item-name')?.toString().trim() || '';
      const category = formData.get('category')?.toString() || 'Women Clothing';
      const type = formData.get('product-type')?.toString().trim() || '';
      const condition = formData.get('condition')?.toString() || 'New';
      const size = formData.get('size')?.toString().trim() || '';
      const price = parseFloat(formData.get('price')?.toString() || '0') || 0;
      const description = formData.get('description')?.toString().trim() || '';
      const imageUrlValue = formData.get('image-url')?.toString().trim() || '';

      if (!name || !price) {
        alert('Product name and price are required.');
        return;
      }

      try {
        await productsCollection.add({
          name,
          category,
          type,
          condition,
          size,
          price,
          imageUrl: imageUrlValue,
          description,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert('Product added successfully. It will appear on the client site within seconds.');
        stockForm.reset();
        if (uploadStatus) uploadStatus.textContent = '';
        showImagePreview('');
      } catch (error) {
        alert('Could not save product: ' + error.message);
      }
    });
  }
}

// ===== Standalone admin dashboard page (admin-dashboard.html) =====
if (pageName === 'admin-dashboard.html') {
  const logoutButton = document.querySelector('.btn-logout');
  if (logoutButton) {
    logoutButton.addEventListener('click', () => auth.signOut());
  }
}

// ===== Standalone admin login page (admin-login.html) =====
if (pageName === 'admin-login.html') {
  const adminLoginForm = document.querySelector('.admin-login-form');
  const messageBox = document.getElementById('admin-login-message');

  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (messageBox) messageBox.textContent = '';
      const email = adminLoginForm.querySelector('input[name="admin-email"]')?.value.trim() || '';
      const password = adminLoginForm.querySelector('input[type="password"]')?.value || '';
      try {
        const credential = await auth.signInWithEmailAndPassword(email, password);
        const adminDoc = await adminsCollection.doc(credential.user.uid).get();
        if (!adminDoc.exists) {
          if (messageBox) messageBox.textContent = 'This account does not have admin access.';
          await auth.signOut();
          return;
        }
        await logLoginEvent(email, 'admin');
        window.location.href = 'admin-dashboard.html';
      } catch (error) {
        if (messageBox) messageBox.textContent = error.message;
      }
    });
  }
}

// ===== Client account page (client-dashboard.html) =====
if (pageName === 'client-dashboard.html') {
  const profileForm = document.getElementById('profile-form');
  const logoutBtn = document.querySelector('.btn-logout');

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await auth.signOut();
      window.location.href = 'client-login.html';
    });
  }

  if (profileForm) {
    profileForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!currentUser) return;
      const phoneInput = document.getElementById('profile-phone');
      try {
        await clientsCollection.doc(currentUser.uid).set(
          { phone: phoneInput?.value.trim() || '' },
          { merge: true }
        );
        alert('Profile updated.');
      } catch (error) {
        alert('Could not save profile: ' + error.message);
      }
    });
  }
}
