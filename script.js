const defaultProducts = [
	{ name: 'Apex RS-7', category: 'wheels', description: 'Lightweight forged wheels with a sharp satin finish.', compatibility: 'Universal fitment', stock: 12, meta: '18 x 8.5 / Satin black', price: 899000, badge: 'Best seller', image: 'https://images.unsplash.com/photo-1553440569-bcc63803a83d?auto=format&fit=crop&w=700&q=80' },
	{ name: 'Lowline Splitter', category: 'exterior', meta: 'Gloss carbon / universal', price: 245000, badge: 'New', image: 'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=700&q=80' },
	{ name: 'Pulse 10 Subwoofer', category: 'audio', meta: '10 inch / 600 watts', price: 329000, badge: '', image: 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=700&q=80' },
	{ name: 'Nightshift Film', category: 'tint', meta: '35% / 20 in x 10 ft', price: 74000, badge: '', image: 'https://images.unsplash.com/photo-1580273916550-e323be2ae537?auto=format&fit=crop&w=700&q=80' },
	{ name: 'Forge 5 Spoke', category: 'wheels', meta: '19 x 9 / Gunmetal', price: 1120000, badge: '', image: 'https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?auto=format&fit=crop&w=700&q=80' },
	{ name: 'Streetline Spoiler', category: 'exterior', meta: 'ABS / paint-ready', price: 390000, badge: '', image: 'https://images.unsplash.com/photo-1542282088-fe8426682b8f?auto=format&fit=crop&w=700&q=80' },
	{ name: 'Arc 2-Way Kit', category: 'audio', meta: '6.5 inch / component', price: 189000, badge: '', image: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=700&q=80' },
	{ name: 'Solarblock 05', category: 'tint', meta: '5% / 24 in x 10 ft', price: 86000, badge: '', image: 'https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=700&q=80' },
	{ name: 'Lumen Pro LED Kit', category: 'lights', meta: '6000K / plug and play', price: 145000, badge: 'New', image: 'https://images.unsplash.com/photo-1493238792000-8113da705763?auto=format&fit=crop&w=700&q=80' },
	{ name: 'Heritage Shift Kit', category: 'interior', meta: 'Leather / brushed alloy', price: 185000, badge: '', image: 'https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=700&q=80' }
];

let products = defaultProducts.map(product => ({ description: 'Premium upgrade selected for fit, function, and finish.', compatibility: 'Check vehicle fitment', stock: 10, ...product }));

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
	document.querySelectorAll('.site-header, .shop-section .section-heading, .shop-toolbar, .feature-image, .feature-copy, .store-info-heading, .store-info-card, footer')
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
		return `<div class="cart-item"><img src="${item.image}" alt=""><div class="cart-item-copy"><strong>${item.name}</strong><small>${formatPrice(item.price)}</small><small>${availability}</small><div class="quantity-controls"><button data-cart-action="decrease" data-product="${item.name}" type="button" aria-label="Decrease ${item.name} quantity">âˆ’</button><span>${item.quantity}</span><button data-cart-action="increase" data-product="${item.name}" type="button" aria-label="Increase ${item.name} quantity"${!product || item.quantity >= stock ? ' disabled' : ''}>+</button></div></div><button class="remove-item" data-cart-action="remove" data-product="${item.name}" type="button">Remove</button></div>`;
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
let loginReturnFocus = null;
let productModalReturnFocus = null;

function closeNavigationOverlays() {
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
	const searchTerm = document.querySelector('#product-search').value.trim().toLowerCase();
	let visible = products.filter(product => {
		const matchesCategory = currentFilter === 'all' || product.category === currentFilter;
		const searchableText = `${product.name} ${product.category} ${product.description} ${product.meta} ${product.compatibility}`.toLowerCase();
		return matchesCategory && (!searchTerm || searchableText.includes(searchTerm));
	});
	grid.innerHTML = visible.map((product, index) => `<article class="product-card motion-reveal" data-product="${product.name}" style="--reveal-delay:${Math.min(index, 6) * 65}ms"><div class="product-image"><img src="${product.image}" alt="${product.name}" loading="lazy">${product.badge ? `<span class="badge">${product.badge}</span>` : ''}<button class="quick-add" data-product="${product.name}" type="button">View details +</button></div><div class="product-info"><h3>${product.name}</h3><p class="product-description">${product.description}</p><div class="product-meta">${product.meta}</div><div class="compatibility">Fits: ${product.compatibility}</div><div class="stock-status${product.stock > 0 ? '' : ' out-of-stock'}">${product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}</div><div class="price">${formatPrice(product.price)}</div></div></article>`).join('');
	observeRevealElements(grid);
}

function renderInventory() {
	const searchTerm = document.querySelector('#inventory-search').value.toLowerCase();
	const visible = products.filter(product => product.name.toLowerCase().includes(searchTerm) || product.category.includes(searchTerm));
	document.querySelector('#inventory-count').textContent = `${products.length} item${products.length === 1 ? '' : 's'}`;
	document.querySelector('#inventory-list').innerHTML = visible.length ? visible.map(product => `<div class="inventory-row"><img src="${product.image}" alt=""><div><strong>${product.name}</strong><small>${product.category} Â· ${formatPrice(product.price)} Â· ${product.stock} in stock</small></div><button class="delete-product" data-product-id="${product.id}" type="button" aria-label="Delete ${product.name}">Delete</button></div>`).join('') : '<p class="empty-inventory">No matching products.</p>';
}

async function loadProducts() {
	try {
		const response = await fetch('/api/products');
		const result = await response.json();
		if (!response.ok) throw new Error(result.error || 'Could not load inventory');
		products = result;
		renderProducts();
		renderInventory();
		renderOffers();
	} catch (error) {
		showToast(`Inventory is using preview data: ${error.message}`);
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
		details.textContent = `${product.stock} in stock Â· ${formatPrice(product.price)}`;
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
		document.querySelector('#admin-dashboard').hidden = false;
		document.querySelector('#admin-dashboard').scrollIntoView({ behavior: 'smooth' });
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
	submitButton.textContent = 'Submitting order...';
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
					payment: formData.get('payment'),
					items: cart.map(item => ({ productId: item.id, quantity: item.quantity }))
				})
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.error || 'Could not place your order');

			const confirmationItems = document.querySelector('#confirmation-items');
			confirmationItems.replaceChildren();
			(result.items || []).forEach(item => {
				const line = document.createElement('p');
				line.textContent = `${item.name} Ã— ${item.quantity}`;
				confirmationItems.append(line);
			});
			document.querySelector('#order-reference').textContent = `Order reference: ${result.reference}`;
			document.querySelector('#confirmation-total').textContent = formatPrice(result.subtotal);
			form.hidden = true;
			document.querySelector('#order-confirmation').hidden = false;
			cart = [];
			saveCart();
			loadProducts();
			showToast('Order received');
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
	window.scrollTo({ top: 0, behavior: 'smooth' });
	showToast('Admin access granted');
});
document.querySelector('#password-toggle').addEventListener('click', event => {
	const passwordInput = document.querySelector('#login-password');
	const isVisible = passwordInput.type === 'text';
	passwordInput.type = isVisible ? 'password' : 'text';
	event.currentTarget.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
	event.currentTarget.setAttribute('aria-pressed', String(!isVisible));
	event.currentTarget.textContent = isVisible ? 'â—‰' : 'â—Ž';
});
document.querySelector('#close-admin').addEventListener('click', () => {
	document.querySelector('#admin-dashboard').hidden = true;
	document.querySelector('#shop').scrollIntoView({ behavior: 'smooth' });
});
document.querySelector('#inventory-search').addEventListener('input', renderInventory);
document.querySelector('#product-form').addEventListener('submit', async event => {
	event.preventDefault();
	const formData = new FormData(event.target);
	const product = { name: formData.get('name'), category: formData.get('category'), description: formData.get('description'), meta: formData.get('meta'), compatibility: formData.get('compatibility'), price: Number(formData.get('price')), stock: Number(formData.get('stock')), badge: formData.get('badge') ? 'New' : '', image: formData.get('image') };
	try {
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
		showToast('Product added to your inventory');
	} catch (error) {
		showToast(`Could not add product: ${error.message}`);
	}
});
document.querySelector('#inventory-list').addEventListener('click', async event => {
	if (!event.target.matches('.delete-product')) return;
	const product = products.find(item => item.id === event.target.dataset.productId);
	if (!product) return;
	try {
		const response = await fetch(`/api/products/${encodeURIComponent(product.id)}`, {
			method: 'DELETE',
			credentials: 'same-origin'
		});
		const result = await response.json();
		if (!response.ok) throw new Error(result.error || 'Could not delete product');
		products = products.filter(item => item.id !== product.id);
		renderProducts();
		renderInventory();
		renderOffers();
		showToast(`${product.name} removed from inventory`);
	} catch (error) {
		showToast(`Could not remove product: ${error.message}`);
	}
});

setupMotion();
renderProducts();
renderCart();
renderOffers();
closeNavigationOverlays();
loadProducts();

