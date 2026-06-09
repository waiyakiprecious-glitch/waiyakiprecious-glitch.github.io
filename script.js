const pageName = window.location.pathname.split('/').pop() || 'index.html';
if (pageName === 'admin.html') {
  window.location.href = 'admin-control.html';
}
const clientLoggedIn = localStorage.getItem('phancyClientLoggedIn') === 'true';
const adminLoggedIn = localStorage.getItem('phancyAdminLoggedIn') === 'true';
const clientEmail = localStorage.getItem('phancyClientEmail') || '';
const adminEmail = localStorage.getItem('phancyAdminEmail') || '';

// Enforce login: redirect to client login for any client-facing page
// Allow admin pages to load so they can show their own login form
const publicPages = ['client-login.html', 'admin.html', 'admin-control.html'];
if (!clientLoggedIn && !adminLoggedIn) {
  if (!publicPages.includes(pageName)) {
    window.location.href = 'client-login.html';
  }
}

const defaultProducts = [
  { id: 1, name: "Women's Summer Dress", category: 'Women Clothing', type: 'Dress', condition: 'New', size: 'M', price: 1499, imageUrl: '', description: 'Light summer dress for women.' },
  { id: 2, name: 'Second-hand Denim Jacket', category: 'Women Clothing', type: 'Jacket', condition: 'Second-hand', size: 'L', price: 799, imageUrl: '', description: 'Classic denim jacket.' },
  { id: 3, name: "Men's Leather Sneakers", category: 'Men Shoes', type: 'Sneakers', condition: 'New', size: '42', price: 2999, imageUrl: '', description: 'Comfortable leather sneakers.' },
  { id: 4, name: "Kids' Sport Shoes", category: 'Children', type: 'Shoes', condition: 'New', size: '32', price: 1199, imageUrl: '', description: 'Sporty shoes for children.' }
];

let activeCategory = 'All';

const categoryLabels = {
  'Women Clothing': "Women's Clothing",
  'Women Shoes': "Women's Shoes",
  'Men Clothing': "Men's Clothing",
  'Men Shoes': "Men's Shoes",
  'Children': 'Children',
  'All': 'All Products'
};

const showElement = (el) => el && el.classList.remove('hidden');
const hideElement = (el) => el && el.classList.add('hidden');

// Load products from server (products.json)
const getProducts = async () => {
  try {
    const response = await fetch('products.json');
    if (response.ok) {
      const data = await response.json();
      const products = data.products || defaultProducts;
      localStorage.setItem('phancyProducts', JSON.stringify(products));
      return products;
    }
  } catch (error) {
    console.log('Could not load from server, using localStorage');
  }
  
  // Fallback to localStorage
  const stored = localStorage.getItem('phancyProducts');
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (error) {
      localStorage.setItem('phancyProducts', JSON.stringify(defaultProducts));
      return defaultProducts;
    }
  }
  
  localStorage.setItem('phancyProducts', JSON.stringify(defaultProducts));
  return defaultProducts;
};

const saveProducts = async (products) => {
  localStorage.setItem('phancyProducts', JSON.stringify(products));
  localStorage.setItem('phancyProductsLastUpdated', Date.now().toString());
  // Dispatch custom event to notify listeners of product changes
  window.dispatchEvent(new CustomEvent('phancyProductsUpdated', { detail: products }));
};

const updateUserBadge = () => {
  const badge = document.getElementById('user-email-badge');
  if (!badge) return;
  const currentEmail = localStorage.getItem('phancyClientEmail') || '';
  badge.textContent = currentEmail ? `Logged in as ${currentEmail}` : '';
};

const updateAdminBadge = () => {
  const badge = document.getElementById('admin-email-badge');
  if (!badge) return;
  const currentEmail = localStorage.getItem('phancyAdminEmail') || '';
  badge.textContent = currentEmail ? `Admin: ${currentEmail}` : '';
};

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

const getOrders = () => {
  const stored = localStorage.getItem('phancyOrders');
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    localStorage.removeItem('phancyOrders');
    return [];
  }
};

const saveOrders = (orders) => {
  localStorage.setItem('phancyOrders', JSON.stringify(orders));
};

const createOrder = (cart, paymentMethod) => {
  const clientEmail = localStorage.getItem('phancyClientEmail') || 'Guest';
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const order = {
    id: Date.now(),
    placedAt: new Date().toISOString(),
    clientEmail,
    paymentMethod,
    total,
    status: 'pending',
    items: cart.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      price: item.price
    }))
  };
  const orders = getOrders();
  orders.unshift(order);
  saveOrders(orders);
  return order;
};

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

const renderCategoryCounts = async () => {
  const products = await getProducts();
  const counts = getCategoryCounts(products);
  const cards = document.querySelectorAll('.category-card');
  cards.forEach((card) => {
    const category = card.dataset.category;
    const label = categoryLabels[category] || category;
    const count = counts[category] ?? 0;
    card.textContent = `${label} (${count})`;
  });
};

const renderAdminInventory = async () => {
  const list = document.getElementById('inventory-list');
  const countsBox = document.getElementById('category-counts');
  const products = await getProducts();
  const counts = getCategoryCounts(products);
  if (countsBox) {
    countsBox.innerHTML = Object.keys(categoryLabels)
      .map((category) => {
        if (category === 'All') return `<div class="inventory-count-item"><strong>${categoryLabels[category]}</strong>: ${counts[category]}</div>`;
        return `<div class="inventory-count-item"><strong>${categoryLabels[category]}</strong>: ${counts[category]}</div>`;
      })
      .join('');
  }
  if (!list) return;
  if (!products.length) {
    list.innerHTML = '<p>No products available yet.</p>';
    return;
  }
  list.innerHTML = products
    .map((product) => `
      <div class="inventory-row">
        <div class="inventory-summary">
          <strong>${product.name}</strong>
          <span>${product.category} · ${product.condition} · ${product.size}${product.type ? ' · ' + product.type : ''}</span>
          <p>${product.description || 'No description'}</p>
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

const updateOrderStatus = (orderId, newStatus) => {
  const orders = getOrders();
  const order = orders.find(o => o.id === orderId);
  if (order) {
    order.status = newStatus;
    saveOrders(orders);
  }
};

const renderAdminOrders = () => {
  const pendingContainer = document.getElementById('pending-order-items');
  const confirmedContainer = document.getElementById('confirmed-order-items');
  const shippedContainer = document.getElementById('shipped-order-items');
  const countsBox = document.getElementById('order-counts');
  const orders = getOrders();
  
  if (countsBox) {
    const pendingCount = orders.filter(o => o.status === 'pending').length;
    const confirmedCount = orders.filter(o => o.status === 'confirmed').length;
    const shippedCount = orders.filter(o => o.status === 'shipped').length;
    countsBox.innerHTML = `
      <div class="inventory-count-item"><strong>Pending</strong>: ${pendingCount}</div>
      <div class="inventory-count-item"><strong>Confirmed</strong>: ${confirmedCount}</div>
      <div class="inventory-count-item"><strong>Shipped</strong>: ${shippedCount}</div>
    `;
  }

  const createOrderCard = (order, statusButtons) => `
    <div class="order-card">
      <h4>Order #${order.id}</h4>
      <p><strong>Placed by:</strong> ${order.clientEmail}</p>
      <p><strong>Payment method:</strong> ${order.paymentMethod}</p>
      <p><strong>Total:</strong> KES ${order.total}</p>
      <p><strong>Status:</strong> <span style="font-weight:bold; color:#0284c7;">${order.status.toUpperCase()}</span></p>
      <div class="order-items">
        ${order.items.map(item => `<div class="order-item"><span>${item.name} x ${item.quantity}</span><span>KES ${item.price}</span></div>`).join('')}
      </div>
      <p class="order-date">${new Date(order.placedAt).toLocaleString()}</p>
      <div style="margin-top:10px; display:flex; gap:10px;">
        ${statusButtons}
      </div>
    </div>
  `;

  if (pendingContainer) {
    const pendingOrders = orders.filter(o => o.status === 'pending');
    pendingContainer.innerHTML = pendingOrders.length ? 
      pendingOrders.map(order => createOrderCard(order, 
        `<button class="btn btn-primary btn-confirm-order" data-order-id="${order.id}">Confirm Order</button>`
      )).join('') : '<p>No pending orders.</p>';
  }

  if (confirmedContainer) {
    const confirmedOrders = orders.filter(o => o.status === 'confirmed');
    confirmedContainer.innerHTML = confirmedOrders.length ? 
      confirmedOrders.map(order => createOrderCard(order, 
        `<button class="btn btn-primary btn-shipped-order" data-order-id="${order.id}">Mark as Shipped</button>`
      )).join('') : '<p>No confirmed orders.</p>';
  }

  if (shippedContainer) {
    const shippedOrders = orders.filter(o => o.status === 'shipped');
    shippedContainer.innerHTML = shippedOrders.length ? 
      shippedOrders.map(order => createOrderCard(order, 
        `<span style="color:#059669; font-weight:bold;">✓ Shipped</span>`
      )).join('') : '<p>No shipped orders.</p>';
  }

  attachOrderStatusButtons();
};

const attachOrderStatusButtons = () => {
  document.querySelectorAll('.btn-confirm-order').forEach(btn => {
    btn.addEventListener('click', () => {
      const orderId = parseInt(btn.dataset.orderId);
      updateOrderStatus(orderId, 'confirmed');
      renderAdminOrders();
    });
  });

  document.querySelectorAll('.btn-shipped-order').forEach(btn => {
    btn.addEventListener('click', () => {
      const orderId = parseInt(btn.dataset.orderId);
      updateOrderStatus(orderId, 'shipped');
      renderAdminOrders();
    });
  });
};

const attachAdminRemoveButtons = () => {
  const removeButtons = document.querySelectorAll('.btn-remove-admin');
  removeButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const id = parseInt(button.dataset.productId, 10);
      const products = (await getProducts()).filter((item) => item.id !== id);
      await saveProducts(products);
      await renderAdminInventory();
      await renderCategoryCounts();
      if (pageName === '' || pageName === 'index.html') {
        await renderProducts(await filterProducts(await getProducts(), activeCategory));
      }
    });
  });
};

const createProductCard = (product) => {
  const article = document.createElement('article');
  article.className = 'product-card';
  const hasImage = Boolean(product.imageUrl);
  const imageStyle = hasImage ? `background: url('${product.imageUrl}') center/cover no-repeat;` : '';
  const imageClass = hasImage ? 'product-image' : 'product-image no-image';
  article.innerHTML = `
    <div class="${imageClass}" style="${imageStyle}">${hasImage ? '' : 'No image available'}</div>
    <h3>${product.name}</h3>
    <p>KES ${product.price}</p>
    <div class="product-meta">${product.condition} · ${product.size}${product.type ? ' · ' + product.type : ''}</div>
    <div class="card-actions">
      <button class="btn btn-add" data-product-id="${product.id}">Add to Cart</button>
    </div>
  `;
  return article;
};

const renderProducts = async (products) => {
  const grid = document.getElementById('product-grid');
  if (!grid) return;
  grid.innerHTML = '';
  if (!products.length) {
    grid.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:#475569;">No products match this category yet.</p>';
    return;
  }
  products.forEach((product) => {
    const card = createProductCard(product);
    grid.appendChild(card);
  });
  attachCartButtons();
};

const attachCartButtons = () => {
  const buttons = document.querySelectorAll('.btn-add');
  buttons.forEach((button) => {
    button.addEventListener('click', async () => {
      const id = parseInt(button.dataset.productId, 10);
      const products = await getProducts();
      const product = products.find((item) => item.id === id);
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
        <h3>${item.name}</h3>
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
  const removeButtons = document.querySelectorAll('.btn-remove');
  removeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const id = parseInt(button.dataset.productId, 10);
      let cart = getCart();
      cart = cart.filter((item) => item.id !== id);
      saveCart(cart);
      renderCart();
    });
  });
};

const filterProducts = async (products, category) => {
  if (category === 'All') return products;
  return products.filter((product) => {
    if (category === 'Children') {
      return product.category === 'Children';
    }
    return product.category === category;
  });
};

const setupCategoryFilters = async () => {
  const cards = document.querySelectorAll('.category-card');
  cards.forEach((card) => {
    if (card.dataset.category === activeCategory) {
      card.classList.add('active');
    }
    card.addEventListener('click', async () => {
      cards.forEach((item) => item.classList.remove('active'));
      card.classList.add('active');
      activeCategory = card.dataset.category;
      const products = await getProducts();
      const filtered = await filterProducts(products, activeCategory);
      await renderProducts(filtered);
      document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
    });
  });
  await renderCategoryCounts();
};

const showRefreshNotice = () => {
  const notice = document.getElementById('refresh-notice');
  if (!notice) return;
  notice.classList.remove('hidden');
  setTimeout(() => notice.classList.add('hidden'), 5000);
};

const setupProductRefresh = async () => {
  let lastProducts = localStorage.getItem('phancyProducts');

  const refreshProducts = async () => {
    const current = localStorage.getItem('phancyProducts');
    if (current && current !== lastProducts) {
      lastProducts = current;
      await renderCategoryCounts();
      const products = await getProducts();
      const filtered = await filterProducts(products, activeCategory);
      await renderProducts(filtered);
      showRefreshNotice();
    }
  };

  // Listen for storage changes from other tabs/windows
  window.addEventListener('storage', (event) => {
    if (event.key === 'phancyProducts' || event.key === 'phancyProductsLastUpdated') {
      refreshProducts();
    }
  });

  // Listen for custom event from same window (admin adds product)
  window.addEventListener('phancyProductsUpdated', () => {
    refreshProducts();
  });

  // Poll for changes every 1 second for faster updates
  setInterval(refreshProducts, 1000);
};

if (pageName === '' || pageName === 'index.html') {
  if (!clientLoggedIn) {
    window.location.href = 'client-login.html';
  } else {
    (async () => {
      const products = await getProducts();
      const filtered = await filterProducts(products, activeCategory);
      await renderCategoryCounts();
      await renderProducts(filtered);
      await setupCategoryFilters();
      setupProductRefresh();
      renderCart();
      updateUserBadge();
      const placeOrderBtn = document.getElementById('place-order-btn');
      if (placeOrderBtn) {
        const paymentMethodSelect = document.getElementById('payment-method');
        placeOrderBtn.addEventListener('click', () => {
          const cart = getCart();
          if (!cart.length) {
            alert('Your cart is empty. Add items before placing an order.');
            return;
          }
          const paymentMethod = paymentMethodSelect?.value || 'M-PESA';
          createOrder(cart, paymentMethod);
          saveCart([]);
          renderCart();
          alert(`Your order has been placed using ${paymentMethod}. Thank you!`);
        });
      }
    })();
  }
}

if (pageName === 'client-login.html') {
  if (clientLoggedIn) {
    window.location.href = 'index.html';
  }

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
    loginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const emailInput = loginForm.querySelector('input[name="client-email"]');
      const email = emailInput?.value.trim() || '';
      if (email) {
        localStorage.setItem('phancyClientEmail', email);
      }
      localStorage.setItem('phancyClientLoggedIn', 'true');
      window.location.href = 'index.html';
    });
  }

  if (signupFormElement) {
    signupFormElement.addEventListener('submit', (event) => {
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
      // simple email validation
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        setFormMessage(signupFormElement, 'Enter a valid email address.', 'error');
        emailInput?.focus();
        return;
      }
      localStorage.setItem('phancyClientEmail', email);
      localStorage.setItem('phancyClientLoggedIn', 'true');
      console.log('Signup successful for', email);
      setFormMessage(signupFormElement, 'Account created — redirecting...', 'success');
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 700);
    });
  }
}

if (pageName === 'admin.html' || pageName === 'admin-control.html') {
  const adminDashboard = document.querySelector('.admin-dashboard');
  const adminLoginCard = document.querySelector('.admin-panel');
  const adminLoginForm = document.querySelector('.admin-login-form');
  const logoutButton = document.querySelector('.btn-logout');
  const stockForm = document.querySelector('.stock-form');

  if (adminLoggedIn) {
    showElement(adminDashboard);
    hideElement(adminLoginCard);
    (async () => {
      await renderAdminInventory();
      renderAdminOrders();
      await renderCategoryCounts();
      updateAdminBadge();
    })();
  } else {
    hideElement(adminDashboard);
    showElement(adminLoginCard);
  }

  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const emailInput = adminLoginForm.querySelector('input[name="admin-email"]');
      const email = emailInput?.value.trim() || '';
      if (email) {
        localStorage.setItem('phancyAdminEmail', email);
      }
      localStorage.setItem('phancyAdminLoggedIn', 'true');
      window.location.reload();
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener('click', () => {
      localStorage.removeItem('phancyAdminLoggedIn');
      window.location.reload();
    });
  }

  if (stockForm) {
    stockForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(stockForm);
      const name = formData.get('item-name')?.toString().trim() || '';
      const category = formData.get('category')?.toString() || 'Women Clothing';
      const type = formData.get('product-type')?.toString().trim() || '';
      const condition = formData.get('condition')?.toString() || 'New';
      const size = formData.get('size')?.toString().trim() || '';
      const price = parseFloat(formData.get('price')?.toString() || '0') || 0;
      const description = formData.get('description')?.toString().trim() || '';
      const imageUrlValue = formData.get('image-url')?.toString().trim() || '';
      const uploadInput = stockForm.querySelector('input[name="upload-image"]');
      const file = uploadInput?.files?.[0];

      const saveNewProduct = async (imageUrl) => {
        const newProduct = {
          id: Date.now(),
          name,
          category,
          type,
          condition,
          size,
          price,
          imageUrl,
          description
        };
        if (!newProduct.name || !newProduct.price) {
          alert('Product name and price are required.');
          return;
        }
        const products = await getProducts();
        products.unshift(newProduct);
        await saveProducts(products);
        alert('Product added successfully. The client site will auto-update within seconds.');
        stockForm.reset();
        await renderAdminInventory();
        await renderCategoryCounts();
      };

      if (file) {
        const reader = new FileReader();
        reader.onload = () => saveNewProduct(reader.result?.toString() || imageUrlValue);
        reader.readAsDataURL(file);
      } else {
        await saveNewProduct(imageUrlValue);
      }
    });
  }
}
