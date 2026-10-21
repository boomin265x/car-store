let products = [];
let productsLoaded = false;
let productLoadError = false;

const grid = document.querySelector('#product-grid');
const toast = document.querySelector('#toast');
let cartCount = 0;
let currentFilter = 'all';
let cart = JSON.parse(localStorage.getItem('torque-cart')) || [];
let hasEnteredSite = false;

const revealObserver = 'IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
	? new IntersectionObserver(entries => {
		entries.forEach(entry => {
			if (!entry.isIntersecting) return;
			entry.target.classList.add('is-visible');
			revealObserver.unobserve(entry.target);
		});
	}, { threshold: 0.12, rootMargin: '0px 0px -36px 0px' })
	: null;

function observeRevealElements(root = document) {
	if (!revealObserver) return;
	root.querySelectorAll('.motion-reveal:not(.is-visible)').forEach(element => revealObserver.observe(element));
}

function setupMotion() {
	if (!revealObserver) return;
	document.body.classList.add('motion-enabled');
	document.querySelectorAll('.site-header, .shop-section .section-heading, .shop-toolbar, .store-info-heading, .store-info-card, footer')
		.forEach(element => element.classList.add('motion-reveal'));
	observeRevealElements();
}

function formatPrice(price) {
	return `MWK ${price.toLocaleString('en-MW')}`;
}

function renderCart() {
	const itemCount = cart.reduce((total, item) => total + item.quantity, 0);
	const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
	document.querySelector('#bottom-cart-count').textContent = itemCount;
	document.querySelector('#cart-total').textContent = formatPrice(total);
	document.querySelector('#cart-items').innerHTML = cart.length ? cart.map(item => {
		const product = products.find(candidate => candidate.name === item.name);
		const stock = product ? product.stock : 0;
		const availability = product ? `${stock} available` : 'No longer available';
		return `<div class="cart-item"><img src="${item.image}" alt=""><div class="cart-item-copy"><strong>${item.name}</strong><small>${formatPrice(item.price)}</small><small>${availability}</small><div class="quantity-controls"><button data-cart-action="decrease" data-product="${item.name}" type="button" aria-label="Decrease ${item.name} quantity">−</button><span>${item.quantity}</span><button data-cart-action="increase" data-product="${item.name}" type="button" aria-label="Increase ${item.name} quantity"${!product || item.quantity >= stock ? ' disabled' : ''}>+</button></div></div><button class="remove-item" data-cart-action="remove" data-product="${item.name}" type="button">Remove</button></div>`;
	}).join('') : '<p class="empty-cart">Your bag is waiting for its first upgrade.</p>';
}

function saveCart() {
	localStorage.setItem('torque-cart', JSON.stringify(cart));
	renderCart();
}

function openCart() {
	document.querySelector('#cart-drawer').hidden = false;
	document.querySelector('#checkout-panel').hidden = true;
	document.body.style.overflow = 'hidden';
	document.querySelector('#cart-close').focus();
}

function closeCart() {
	document.querySelector('#cart-drawer').hidden = true;
	document.querySelector('#checkout-panel').hidden = true;
	document.body.style.overflow = '';
	document.querySelector('#bottom-cart').focus();
}
let adminAuthenticated = false;
let adminDashboardLoaded = false;
let adminOrdersRefreshTimer = null;
let adminOrders = [];
let loginReturnFocus = null;
let productModalReturnFocus = null;

function closeOptionsMenu() {
	const menu = document.querySelector('#site-options-menu');
	const toggle = document.querySelector('#options-menu-toggle');
	menu.hidden = true;
	toggle.setAttribute('aria-expanded', 'false');
}

function setupOptionsMenu() {
	const toggle = document.querySelector('#options-menu-toggle');
	const menu = document.querySelector('#site-options-menu');
	toggle.addEventListener('click', () => {
		menu.hidden = !menu.hidden;
		toggle.setAttribute('aria-expanded', String(!menu.hidden));
	});
	menu.addEventListener('click', event => {
		if (event.target.closest('a[data-menu-link]')) closeOptionsMenu();
	});
	document.addEventListener('click', event => {
		if (!menu.contains(event.target) && !toggle.contains(event.target)) closeOptionsMenu();
	});
	document.addEventListener('keydown', event => {
		if (event.key === 'Escape') closeOptionsMenu();
	});
}

function closeNavigationOverlays() {
	closeOptionsMenu();
	document.querySelector('#login-screen').hidden = true;
	document.querySelector('#cart-drawer').hidden = true;
	document.querySelector('#checkout-panel').hidden = true;
	document.querySelector('#product-modal').hidden = true;
	document.querySelector('#notifications-panel').hidden = true;
	document.body.style.overflow = '';
}

function setActiveNavigation(buttonId) {
	document.querySelectorAll('.bottom-nav-item').forEach(button => {
		const active = button.id === buttonId;
		button.classList.toggle('active', active);
		button.setAttribute('aria-pressed', String(active));
	});
}

function openLogin() {
	loginReturnFocus = document.activeElement;
	document.querySelector('#login-screen').hidden = false;
	document.body.style.overflow = 'hidden';
	document.querySelector('#login-email').focus();
}

function closeLogin() {
	document.querySelector('#login-screen').hidden = true;
	document.body.style.overflow = '';
	if (loginReturnFocus instanceof HTMLElement && !loginReturnFocus.closest('[hidden]')) loginReturnFocus.focus();
	loginReturnFocus = null;
}

async function loadAdminDashboard() {
	if (adminDashboardLoaded) return;
	const response = await fetch('/api/admin/dashboard', { credentials: 'same-origin' });
	const result = await response.text();
	if (!response.ok) {
		if (response.status === 401) {
			adminAuthenticated = false;
			openLogin();
			throw new Error('Your admin session expired. Please sign in again.');
		}
		throw new Error('Could not load the admin dashboard.');
	}
	const root = document.querySelector('#admin-dashboard-root');
	root.innerHTML = result;
	adminDashboardLoaded = true;
	wireAdminDashboard();
	renderInventory();
}

function renderAdminOrders(orders) {
	const list = document.querySelector('#admin-orders-list');
	const count = document.querySelector('#admin-order-count');
	const status = document.querySelector('#orders-status');
	if (!list || !count || !status) return;
	count.textContent = `${orders.length} order${orders.length === 1 ? '' : 's'}`;
	list.replaceChildren();
	if (!orders.length) {
		status.textContent = 'No customer orders yet.';
		return;
	}
	orders.forEach(order => {
		const card = document.createElement('article');
		card.className = 'admin-order-card';
		const header = document.createElement('div');
		header.className = 'admin-order-header';
		const heading = document.createElement('div');
		const reference = document.createElement('h3');
		reference.textContent = order.reference || 'Order';
		const date = document.createElement('p');
		date.className = 'admin-order-date';
		date.textContent = order.created_at ? new Date(order.created_at).toLocaleString() : '';
		heading.append(reference, date);
		const badge = document.createElement('span');
		badge.className = 'admin-order-status';
		badge.textContent = order.status || 'pending';
		header.append(heading, badge);
		const details = document.createElement('div');
		details.className = 'admin-order-details';
		const addDetail = (label, value) => {
			const detail = document.createElement('p');
			const caption = document.createElement('strong');
			caption.textContent = label;
			detail.append(caption, document.createTextNode(value || 'Not provided'));
			details.append(detail);
		};
		addDetail('Customer', order.customer_name);
		addDetail('Phone', order.customer_phone);
		addDetail('Delivery address', order.delivery_address);
		addDetail('Payment method', order.payment_method);
		addDetail('Payment status', order.payment_status || 'unpaid');
		addDetail('Delivery service', order.delivery_method || 'Not recorded');
		const items = document.createElement('ul');
		items.className = 'admin-order-items';
		(order.order_items || []).forEach(item => {
			const line = document.createElement('li');
			const name = document.createElement('span');
			name.textContent = `${item.product_name} × ${item.quantity}`;
			const amount = document.createElement('span');
			amount.textContent = formatPrice(item.line_total);
			line.append(name, amount);
			items.append(line);
		});
		const total = document.createElement('div');
		total.className = 'admin-order-total';
		const totalLabel = document.createElement('span');
		totalLabel.textContent = 'Order total';
		const totalAmount = document.createElement('strong');
		totalAmount.textContent = formatPrice(order.subtotal || 0);
		total.append(totalLabel, totalAmount);
		card.append(header, details, items, total);
		list.append(card);
	});
	status.textContent = `Showing ${orders.length} customer order${orders.length === 1 ? '' : 's'}.`;
}

function renderAdminCustomers(orders) {
	const list = document.querySelector('#admin-customers-list');
	const count = document.querySelector('#admin-customer-count');
	const status = document.querySelector('#customers-status');
	const search = document.querySelector('#customer-search');
	if (!list || !count || !status) return;
	const customerMap = new Map();
	orders.forEach(order => {
		const phone = String(order.customer_phone || '');
		const key = phone.replace(/\D/g, '') || `${order.customer_name}|${order.delivery_address}`.toLowerCase();
		let customer = customerMap.get(key);
		if (!customer) {
			customer = { name: order.customer_name, phone, address: order.delivery_address, orderCount: 0, totalSpent: 0, lastOrderAt: 0 };
			customerMap.set(key, customer);
		}
		customer.orderCount += 1;
		customer.totalSpent += Number(order.subtotal) || 0;
		const orderTime = Date.parse(order.created_at) || 0;
		if (orderTime >= customer.lastOrderAt) {
			customer.lastOrderAt = orderTime;
			customer.name = order.customer_name;
			customer.phone = phone;
			customer.address = order.delivery_address;
		}
	});
	const customers = [...customerMap.values()].sort((a, b) => b.lastOrderAt - a.lastOrderAt);
	count.textContent = `${customers.length} customer${customers.length === 1 ? '' : 's'}`;
	const searchTerm = (search?.value || '').trim().toLowerCase();
	const visible = customers.filter(customer => `${customer.name} ${customer.phone} ${customer.address}`.toLowerCase().includes(searchTerm));
	list.replaceChildren();
	if (!visible.length) {
		status.textContent = customers.length ? 'No customers match your search.' : 'No customers yet. Customer records appear after their first order.';
		return;
	}
	visible.forEach(customer => {
		const card = document.createElement('article');
		card.className = 'admin-customer-card';
		const header = document.createElement('div');
		header.className = 'admin-customer-header';
		const heading = document.createElement('div');
		const name = document.createElement('h3');
		name.textContent = customer.name || 'Customer';
		const lastOrder = document.createElement('p');
		lastOrder.className = 'admin-customer-date';
		lastOrder.textContent = customer.lastOrderAt ? `Last order: ${new Date(customer.lastOrderAt).toLocaleString()}` : '';
		heading.append(name, lastOrder);
		header.append(heading);
		const details = document.createElement('div');
		details.className = 'admin-customer-details';
		const addDetail = (label, value) => {
			const detail = document.createElement('p');
			const caption = document.createElement('strong');
			caption.textContent = label;
			detail.append(caption, document.createTextNode(value || 'Not provided'));
			details.append(detail);
		};
		addDetail('Phone', customer.phone);
		addDetail('Delivery address', customer.address);
		const summary = document.createElement('div');
		summary.className = 'admin-customer-summary';
		const orderCount = document.createElement('span');
		orderCount.textContent = `${customer.orderCount} order${customer.orderCount === 1 ? '' : 's'}`;
		const totalSpent = document.createElement('strong');
		totalSpent.textContent = `${formatPrice(customer.totalSpent)} spent`;
		summary.append(orderCount, totalSpent);
		card.append(header, details, summary);
		list.append(card);
	});
	status.textContent = `Showing ${visible.length} of ${customers.length} customer${customers.length === 1 ? '' : 's'}.`;
}

function showAdminView(viewName) {
	const root = document.querySelector('#admin-dashboard-root');
	root.querySelectorAll('.admin-view').forEach(view => { view.hidden = view.id !== `admin-view-${viewName}`; });
	root.querySelectorAll('[data-admin-view]').forEach(button => {
		const active = button.dataset.adminView === viewName;
		button.classList.toggle('active', active);
		if (active) button.setAttribute('aria-current', 'page');
		else button.removeAttribute('aria-current');
	});
}

async function loadAdminOrders() {
	const root = document.querySelector('#admin-dashboard-root');
	const list = root?.querySelector('#admin-orders-list');
	const status = root?.querySelector('#orders-status');
	const refreshButton = root?.querySelector('#refresh-orders');
	if (!list || !status) return;
	if (refreshButton) refreshButton.disabled = true;
	status.textContent = 'Loading customer orders…';
	try {
		const response = await fetch('/api/admin/orders', { credentials: 'same-origin' });
		const result = await response.json();
		if (!response.ok) throw new Error(result.error || 'Could not load customer orders');
		adminOrders = result;
		renderAdminOrders(adminOrders);
		renderAdminCustomers(adminOrders);
	} catch (error) {
		status.textContent = `Could not load orders: ${error.message}`;
	} finally {
		if (refreshButton) refreshButton.disabled = false;
	}
}

function readImageAsBase64(file) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.addEventListener('load', () => {
			const result = String(reader.result || '');
			resolve(result.slice(result.indexOf(',') + 1));
		});
		reader.addEventListener('error', () => reject(new Error('Could not read the selected image.')));
		reader.readAsDataURL(file);
	});
}

async function openAdminDashboard() {
	if (!adminAuthenticated) return openLogin();
	await loadAdminDashboard();
	const dashboard = document.querySelector('#admin-dashboard');
	dashboard.hidden = false;
	document.body.classList.add('admin-mode');
	dashboard.scrollIntoView({ behavior: 'smooth' });
	loadAdminOrders();
	if (!adminOrdersRefreshTimer) adminOrdersRefreshTimer = setInterval(() => {
		if (adminAuthenticated && !dashboard.hidden) loadAdminOrders();
	}, 30000);
}

async function restoreAdminSession() {
	try {
		const response = await fetch('/api/admin/session', { credentials: 'same-origin' });
		if (!response.ok) return;
		const result = await response.json();
		adminAuthenticated = result.authenticated === true;
	} catch {
		adminAuthenticated = false;
	}
}

function addProductToCart(product) {
	if (!product || product.stock <= 0) {
		showToast('This upgrade is currently out of stock');
		return false;
	}
	const existing = cart.find(item => item.name === product.name);
	if (existing && existing.quantity >= product.stock) {
		showToast(`Only ${product.stock} available`);
		return false;
	}
	if (existing) existing.quantity += 1;
	else cart.push({ ...product, quantity: 1 });
	saveCart();
	showToast(`${product.name} added to your bag`);
	return true;
}

function renderProducts() {
	if (!productsLoaded) {
		grid.innerHTML = '<p class="products-message" role="status">Loading products…</p>';
		return;
	}
	const searchTerm = document.querySelector('#product-search').value.trim().toLowerCase();
	const visible = products.filter(product => {
		const matchesCategory = currentFilter === 'all' || product.category === currentFilter;
		const searchableText = `${product.name} ${product.category} ${product.description} ${product.meta} ${product.compatibility}`.toLowerCase();
		return matchesCategory && (!searchTerm || searchableText.includes(searchTerm));
	});
	if (!visible.length) {
		const message = productLoadError
			? 'Products could not be loaded. Check your connection and refresh to try again.'
			: searchTerm
				? 'No products match your search.'
				: 'No products are available right now.';
		grid.innerHTML = `<p class="products-message" role="status">${message}</p>`;
		return;
	}
	grid.innerHTML = visible.map((product, index) => `<article class="product-card motion-reveal" data-product="${product.name}" style="--reveal-delay:${Math.min(index, 6) * 65}ms"><div class="product-image"><img src="${product.image}" alt="${product.name}" loading="lazy">${product.badge ? `<span class="badge">${product.badge}</span>` : ''}<button class="quick-add" data-product="${product.name}" type="button">View details +</button></div><div class="product-info"><h3>${product.name}</h3><p class="product-description">${product.description}</p><div class="product-meta">${product.meta}</div><div class="compatibility">Fits: ${product.compatibility}</div><div class="stock-status${product.stock > 0 ? '' : ' out-of-stock'}">${product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}</div><div class="price">${formatPrice(product.price)}</div></div></article>`).join('');
	observeRevealElements(grid);
}

function renderInventory() {
	const search = document.querySelector('#inventory-search');
	const list = document.querySelector('#inventory-list');
	if (!search || !list) return;
	const searchTerm = search.value.toLowerCase();
	const visible = products.filter(product => product.name.toLowerCase().includes(searchTerm) || product.category.includes(searchTerm));
	document.querySelector('#inventory-count').textContent = `${products.length} item${products.length === 1 ? '' : 's'}`;
	list.innerHTML = visible.length ? visible.map(product => `<div class="inventory-row"><img src="${product.image}" alt=""><div><strong>${product.name}</strong><small>${product.category} · ${formatPrice(product.price)} · ${product.stock} in stock</small></div><button class="delete-product" data-product-id="${product.id}" type="button" aria-label="Delete ${product.name}">Delete</button></div>`).join('') : '<p class="empty-inventory">No matching products.</p>';
}

async function loadProducts() {
	try {
		const response = await fetch('/api/products');
		const result = await response.json();
		if (!response.ok) throw new Error(result.error || 'Could not load inventory');
		if (!Array.isArray(result)) throw new Error('The product list was not valid');
		products = result;
		productsLoaded = true;
		productLoadError = false;
		renderProducts();
		renderInventory();
		renderOffers();
	} catch (error) {
		products = [];
		productsLoaded = true;
		productLoadError = true;
		renderProducts();
		renderInventory();
		renderOffers();
		showToast('Could not load products. Check your connection.');
	}
}

function renderOffers() {
	const offers = products.filter(product => product.badge === 'New' && product.stock > 0);
	const offerList = document.querySelector('#offer-list');
	document.querySelectorAll('.notification-count').forEach(offerCount => {
		offerCount.textContent = offers.length;
		offerCount.hidden = offers.length === 0;
	});
	document.querySelector('#header-notifications').setAttribute('aria-label', `Open notifications, ${offers.length} new arrival${offers.length === 1 ? '' : 's'}`);
	offerList.replaceChildren();
	if (!offers.length) {
		const emptyMessage = document.createElement('p');
		emptyMessage.className = 'empty-offers';
		emptyMessage.textContent = 'No new arrivals right now. Check back soon for fresh parts.';
		offerList.append(emptyMessage);
		return;
	}

	offers.forEach(product => {
		const card = document.createElement('article');
		card.className = 'offer-card';
		const image = document.createElement('img');
		image.className = 'offer-image';
		image.src = product.image;
		image.alt = product.name;
		const copy = document.createElement('div');
		copy.className = 'offer-copy';
		const tag = document.createElement('p');
		tag.className = 'eyebrow';
		tag.textContent = 'NEW ARRIVAL';
		const name = document.createElement('h3');
		name.textContent = product.name;
		const description = document.createElement('p');
		description.textContent = product.description;
		const details = document.createElement('small');
		details.textContent = `${product.stock} in stock · ${formatPrice(product.price)}`;
		const button = document.createElement('button');
		button.className = 'button button-dark';
		button.type = 'button';
		button.dataset.product = product.name;
		button.textContent = 'Shop this upgrade';
		copy.append(tag, name, description, details, button);
		card.append(image, copy);
		offerList.append(card);
	});
}

function showToast(message) {
	toast.textContent = message;
	toast.classList.add('visible');
	setTimeout(() => toast.classList.remove('visible'), 2400);
}

function setupAppInstall() {
	const installButton = document.querySelector('#install-app');
	const instructions = document.querySelector('#install-instructions');
	let pendingInstallPrompt = null;
	const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
	const isSafari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);
	const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
	if (isStandalone) return;

	window.addEventListener('beforeinstallprompt', event => {
		event.preventDefault();
		pendingInstallPrompt = event;
		installButton.hidden = false;
	});
	window.addEventListener('appinstalled', () => {
		pendingInstallPrompt = null;
		installButton.hidden = true;
		showToast('Auto Customs added to your phone');
	});
	if (isIOS && isSafari) installButton.hidden = false;

	installButton.addEventListener('click', async () => {
		closeOptionsMenu();
		if (pendingInstallPrompt) {
			pendingInstallPrompt.prompt();
			await pendingInstallPrompt.userChoice;
			pendingInstallPrompt = null;
			installButton.hidden = true;
			return;
		}
		if (typeof instructions.showModal === 'function') instructions.showModal();
		else showToast('In Safari, tap Share, then Add to Home Screen');
	});
	const closeInstructions = () => instructions.close();
	document.querySelector('#install-close').addEventListener('click', closeInstructions);
	document.querySelector('#install-done').addEventListener('click', closeInstructions);
}

if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
	window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js').catch(() => {}));
}
setupOptionsMenu();
setupAppInstall();

document.querySelectorAll('.filter').forEach(button => button.addEventListener('click', () => {
	document.querySelector('.filter.active').classList.remove('active');
	button.classList.add('active');
	document.querySelectorAll('.filter').forEach(filter => filter.setAttribute('aria-pressed', String(filter === button)));
	currentFilter = button.dataset.filter;
	renderProducts();
}));
document.querySelectorAll('[data-filter-link]').forEach(link => link.addEventListener('click', () => document.querySelector(`[data-filter="${link.dataset.filterLink}"]`).click()));
document.querySelector('#product-search').addEventListener('input', renderProducts);
grid.addEventListener('click', event => {
	const quickAddButton = event.target.closest('.quick-add');
	if (!quickAddButton) return;
	const product = products.find(item => item.name === quickAddButton.dataset.product);
	if (product) openProductModal(product);
});
function openProductModal(product, returnFocus = document.activeElement) {
	if (!product) return;
	if (document.querySelector('#product-modal').hidden) productModalReturnFocus = returnFocus;
	const addButton = document.querySelector('#modal-add-button');
	document.querySelector('#modal-product-image').src = product.image;
	document.querySelector('#modal-product-image').alt = product.name;
	document.querySelector('#modal-product-category').textContent = `${product.category} / PRODUCT DETAILS`;
	document.querySelector('#modal-product-name').textContent = product.name;
	document.querySelector('#modal-product-description').textContent = product.description;
	document.querySelector('#modal-product-meta').textContent = product.meta;
	document.querySelector('#modal-product-fitment').textContent = product.compatibility;
	document.querySelector('#modal-product-stock').textContent = product.stock > 0 ? `${product.stock} available` : 'Out of stock';
	document.querySelector('#modal-product-price').textContent = formatPrice(product.price);
	addButton.dataset.product = product.name;
	addButton.disabled = product.stock <= 0;
	addButton.textContent = product.stock > 0 ? 'Add to bag +' : 'Out of stock';
	document.querySelector('#product-modal').hidden = false;
	document.querySelector('#modal-close').focus();
}

function closeProductModal() {
	document.querySelector('#product-modal').hidden = true;
	if (productModalReturnFocus instanceof HTMLElement && !productModalReturnFocus.closest('[hidden]')) productModalReturnFocus.focus();
	productModalReturnFocus = null;
}

grid.addEventListener('click', event => {
	if (event.target.closest('.quick-add')) return;
	const card = event.target.closest('.product-card');
	if (card) openProductModal(products.find(product => product.name === card.dataset.product));
});
document.querySelector('#modal-close').addEventListener('click', closeProductModal);
document.querySelector('#product-modal').addEventListener('click', event => {
	if (event.target.id === 'product-modal') closeProductModal();
});
document.querySelector('#modal-add-button').addEventListener('click', event => {
	const product = products.find(item => item.name === event.target.dataset.product);
	if (addProductToCart(product)) closeProductModal();
});
document.querySelector('#bottom-home').addEventListener('click', () => {
	closeNavigationOverlays();
	setActiveNavigation('bottom-home');
	window.scrollTo({ top: 0, behavior: 'smooth' });
});
document.querySelector('#bottom-cart').addEventListener('click', () => {
	closeNavigationOverlays();
	setActiveNavigation('bottom-cart');
	openCart();
});
document.querySelector('#bottom-offers').addEventListener('click', () => {
	closeNavigationOverlays();
	setActiveNavigation('bottom-offers');
	renderOffers();
	document.querySelector('#notifications-panel').hidden = false;
	document.body.style.overflow = 'hidden';
	document.querySelector('#notifications-close').focus();
});
document.querySelector('#header-notifications').addEventListener('click', () => {
	document.querySelector('#bottom-offers').click();
});
document.querySelector('#offer-list').addEventListener('click', event => {
	const button = event.target.closest('button[data-product]');
	if (!button) return;
	const product = products.find(item => item.name === button.dataset.product);
	if (!product) return;
	closeNavigationOverlays();
	openProductModal(product, document.querySelector('#bottom-offers'));
});
document.querySelector('#bottom-account').addEventListener('click', () => {
	closeNavigationOverlays();
	setActiveNavigation('bottom-account');
	if (adminAuthenticated) {
		openAdminDashboard().catch(error => showToast(error.message));
	} else openLogin();
});
document.querySelector('#bottom-search').addEventListener('click', () => {
	closeNavigationOverlays();
	setActiveNavigation('bottom-search');
	const shop = document.querySelector('#shop');
	const search = document.querySelector('#product-search');
	shop.scrollIntoView({ behavior: 'smooth' });
	search.focus({ preventScroll: true });
});
document.querySelector('#cart-close').addEventListener('click', closeCart);
document.querySelector('#cart-items').addEventListener('click', event => {
	const action = event.target.dataset.cartAction;
	if (!action) return;
	const item = cart.find(product => product.name === event.target.dataset.product);
	if (!item) return;
	const product = products.find(candidate => candidate.name === item.name);
	if (action === 'increase') item.quantity += 1;
	if (action === 'decrease') item.quantity -= 1;
	if (action === 'remove' || item.quantity < 1) cart = cart.filter(product => product.name !== item.name);
	if (action === 'increase' && (!product || item.quantity > product.stock)) {
		item.quantity -= 1;
		showToast(product ? `Only ${product.stock} available` : 'This upgrade is no longer available');
		return;
	}
	saveCart();
});
document.querySelector('#checkout-button').addEventListener('click', () => {
	if (!cart.length) return showToast('Add an upgrade before checkout');
	const unavailableItem = cart.find(item => {
		const product = products.find(candidate => candidate.name === item.name);
		return !product || product.stock < item.quantity;
	});
	if (unavailableItem) return showToast(`Check availability for ${unavailableItem.name} in your bag`);
	document.querySelector('#checkout-total').textContent = document.querySelector('#cart-total').textContent;
	document.querySelector('#cart-drawer').hidden = true;
	document.querySelector('#checkout-panel').hidden = false;
	document.querySelector('#checkout-form').hidden = false;
	document.querySelector('#order-confirmation').hidden = true;
	document.querySelector('#checkout-close').focus();
	showToast('Checkout is ready for the backend connection');
});
document.querySelector('#checkout-close').addEventListener('click', () => {
	closeCart();
	document.querySelector('#bottom-cart').focus();
});
document.querySelector('#notifications-close').addEventListener('click', () => {
	closeNavigationOverlays();
	document.querySelector('#bottom-offers').focus();
});
document.querySelector('#checkout-form').addEventListener('submit', event => {
	event.preventDefault();
	const form = event.currentTarget;
	const formData = new FormData(form);
	const errorMessage = document.querySelector('#checkout-error');
	const submitButton = form.querySelector('button[type="submit"]');
	const originalButtonContent = submitButton.innerHTML;
	errorMessage.hidden = true;
	errorMessage.textContent = '';
	submitButton.disabled = true;
	submitButton.textContent = 'Connecting to PayChangu...';
	(async () => {
		try {
			if (cart.some(item => !item.id)) throw new Error('Your bag contains an older item. Remove it and add it again before placing the order.');
			const response = await fetch('/api/orders', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({
					customerName: formData.get('customerName'),
					phone: formData.get('phone'),
					address: formData.get('address'),
					payment: 'PayChangu',
					deliveryMethod: formData.get('deliveryMethod'),
					items: cart.map(item => ({ productId: item.id, quantity: item.quantity }))
				})
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error || 'Could not place your order');
			if (typeof result.checkoutUrl !== 'string' || !result.checkoutUrl.startsWith('https://')) throw new Error('PayChangu did not return a valid checkout link.');
			window.location.assign(result.checkoutUrl);
		} catch (error) {
			errorMessage.textContent = error.message;
			errorMessage.hidden = false;
		} finally {
			submitButton.disabled = false;
			submitButton.innerHTML = originalButtonContent;
		}
	})();
});
document.querySelector('#continue-shopping').addEventListener('click', closeCart);
document.addEventListener('keydown', event => {
	const activeDialog = ['#login-screen', '#cart-drawer', '#checkout-panel', '#notifications-panel', '#product-modal']
		.map(selector => document.querySelector(selector))
		.find(dialog => !dialog.hidden);
	if (!activeDialog) return;
	if (event.key === 'Escape') {
		if (activeDialog.id === 'product-modal') closeProductModal();
		else if (activeDialog.id === 'login-screen') closeLogin();
		else {
			closeNavigationOverlays();
			document.querySelector(`#bottom-${activeDialog.id === 'cart-drawer' || activeDialog.id === 'checkout-panel' ? 'cart' : 'offers'}`).focus();
		}
		return;
	}
	if (event.key === 'Tab') {
		const focusable = [...activeDialog.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary')]
			.filter(element => element.getClientRects().length);
		if (!focusable.length) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	}
});
document.querySelector('#login-form').addEventListener('submit', async event => {
	event.preventDefault();
	const formData = new FormData(event.target);
	const loginError = document.querySelector('#login-error');
	loginError.textContent = '';
	try {
		const response = await fetch('/api/admin/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'same-origin',
			body: JSON.stringify({ email: formData.get('email'), password: formData.get('password') })
		});
		const result = await response.json();
		if (!response.ok) throw new Error(result.error || 'Sign-in failed');
	} catch (error) {
		loginError.textContent = error.message;
		return;
	}
	adminAuthenticated = true;
	hasEnteredSite = true;
	document.querySelector('.bottom-nav').hidden = false;
	closeLogin();
	document.querySelector('#login-form').reset();
	try {
		await openAdminDashboard();
		showToast('Admin access granted');
	} catch (error) {
		adminAuthenticated = false;
		openLogin();
		loginError.textContent = error.message;
	}
});
document.querySelector('#password-toggle').addEventListener('click', event => {
	const passwordInput = document.querySelector('#login-password');
	const isVisible = passwordInput.type === 'text';
	passwordInput.type = isVisible ? 'password' : 'text';
	event.currentTarget.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
	event.currentTarget.setAttribute('aria-pressed', String(!isVisible));
	event.currentTarget.textContent = isVisible ? '◉' : '◎';
});

function wireAdminDashboard() {
	const root = document.querySelector('#admin-dashboard-root');
	const imageInput = root.querySelector('input[name="imageFile"]');
	const imagePreview = root.querySelector('#image-preview');
	imageInput.addEventListener('change', () => {
		if (imagePreview.dataset.objectUrl) URL.revokeObjectURL(imagePreview.dataset.objectUrl);
		const file = imageInput.files[0];
		if (!file) {
			imagePreview.removeAttribute('src');
			imagePreview.hidden = true;
			return;
		}
		imagePreview.dataset.objectUrl = URL.createObjectURL(file);
		imagePreview.src = imagePreview.dataset.objectUrl;
		imagePreview.hidden = false;
	});
	root.querySelector('#close-admin').addEventListener('click', () => {
		root.querySelector('#admin-dashboard').hidden = true;
		document.body.classList.remove('admin-mode');
		if (adminOrdersRefreshTimer) clearInterval(adminOrdersRefreshTimer);
		adminOrdersRefreshTimer = null;
		document.querySelector('#shop').scrollIntoView({ behavior: 'smooth' });
	});
	root.querySelector('#admin-logout').addEventListener('click', async () => {
		try {
			await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
		} finally {
			document.body.classList.remove('admin-mode');
			adminAuthenticated = false;
			adminDashboardLoaded = false;
			if (adminOrdersRefreshTimer) clearInterval(adminOrdersRefreshTimer);
			adminOrdersRefreshTimer = null;
			root.replaceChildren();
			document.querySelector('#shop').scrollIntoView({ behavior: 'smooth' });
			showToast('Signed out of the admin dashboard');
		}
	});
	root.querySelector('#inventory-search').addEventListener('input', renderInventory);
	root.querySelector('#refresh-orders').addEventListener('click', loadAdminOrders);
	root.querySelector('#customer-search').addEventListener('input', () => renderAdminCustomers(adminOrders));
	root.querySelectorAll('[data-admin-view]').forEach(button => button.addEventListener('click', () => showAdminView(button.dataset.adminView)));
	root.querySelector('#product-form').addEventListener('submit', async event => {
		event.preventDefault();
		const formData = new FormData(event.target);
		const imageFile = formData.get('imageFile');
		if (!(imageFile instanceof File) || !imageFile.size) return showToast('Choose a product image from your device');
		if (imageFile.size > 5 * 1024 * 1024) return showToast('Images must be 5 MB or smaller');
		const product = { name: formData.get('name'), category: formData.get('category'), description: formData.get('description'), meta: formData.get('meta'), compatibility: formData.get('compatibility'), price: Number(formData.get('price')), stock: Number(formData.get('stock')), badge: formData.get('badge') ? 'New' : '' };
		try {
			const uploadResponse = await fetch('/api/admin/images', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify({ type: imageFile.type, data: await readImageAsBase64(imageFile) })
			});
			const uploadedImage = await uploadResponse.json();
			if (!uploadResponse.ok) throw new Error(uploadedImage.error || 'Could not upload the product image');
			product.image = uploadedImage.url;
			const response = await fetch('/api/products', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'same-origin',
				body: JSON.stringify(product)
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error || 'Could not save product');
			products.push(result);
			renderProducts();
			renderInventory();
			renderOffers();
			event.target.reset();
			if (imagePreview.dataset.objectUrl) URL.revokeObjectURL(imagePreview.dataset.objectUrl);
			imagePreview.removeAttribute('src');
			imagePreview.hidden = true;
			showToast('Product added to your inventory');
		} catch (error) {
			showToast(`Could not add product: ${error.message}`);
		}
	});
	root.querySelector('#inventory-list').addEventListener('click', async event => {
		const button = event.target.closest('.delete-product');
		if (!button || button.disabled) return;
		const product = products.find(item => item.id === button.dataset.productId);
		if (!product) return;
		button.disabled = true;
		button.textContent = 'Deleting…';
		try {
			const response = await fetch(`/api/products/${encodeURIComponent(product.id)}`, {
				method: 'DELETE',
				credentials: 'same-origin'
			});
			const result = await response.json();
			if (!response.ok || result.deleted !== true) throw new Error(result.error || 'Could not delete product');
			products = products.filter(item => item.id !== product.id);
			renderProducts();
			renderInventory();
			renderOffers();
			showToast(`${product.name} removed from inventory`);
		} catch (error) {
			showToast(`Could not remove product: ${error.message}`);
			button.disabled = false;
			button.textContent = 'Delete';
		}
	});
}

setupMotion();
if (new URLSearchParams(window.location.search).get('payment') === 'paid') {
	cart = [];
	localStorage.removeItem('torque-cart');
	window.history.replaceState({}, '', window.location.pathname + window.location.hash);
}
renderProducts();
renderCart();
renderOffers();
closeNavigationOverlays();
loadProducts();
restoreAdminSession();

