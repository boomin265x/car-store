const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = __dirname;
const sessions = new Map();
const loginAttempts = new Map();
const orderAttempts = new Map();
const sessionLifetimeMs = 8 * 60 * 60 * 1000;
const port = Number(process.env.PORT || 3000);

function loadEnvFile() {
	const envPath = path.join(root, '.env');
	if (!fs.existsSync(envPath)) return;
	for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
		const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
		if (!match || Object.hasOwn(process.env, match[1])) continue;
		process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
	}
}

loadEnvFile();

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD;

function json(response, status, body, headers = {}) {
	response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
	response.end(JSON.stringify(body));
}

function safeEqual(left, right) {
	const leftBuffer = Buffer.from(left);
	const rightBuffer = Buffer.from(right);
	return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sessionFromRequest(request) {
	const cookie = request.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('torque_session='));
	const token = cookie?.slice('torque_session='.length);
	const expiry = sessions.get(token);
	if (!expiry || expiry < Date.now()) {
		sessions.delete(token);
		return null;
	}
	return token;
}

async function readJson(request, maxLength = 1024 * 1024) {
	let body = '';
	for await (const chunk of request) {
		body += chunk;
		if (body.length > maxLength) {
			const error = new Error(`Request body exceeds ${Math.floor(maxLength / (1024 * 1024))} MB`);
			error.status = 413;
			throw error;
		}
	}
	return JSON.parse(body);
}

function imageFormatMatches(buffer, mimeType) {
	if (mimeType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
	if (mimeType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
	if (mimeType === 'image/webp') return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
	if (mimeType === 'image/gif') return ['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6));
	return false;
}

async function supabaseRequest(resource, options = {}) {
	if (!supabaseUrl || !serviceKey) {
		const error = new Error('Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.');
		error.status = 503;
		throw error;
	}
	const response = await fetch(`${supabaseUrl}/rest/v1/${resource}`, {
		...options,
		headers: {
			apikey: serviceKey,
			Authorization: `Bearer ${serviceKey}`,
			'Content-Type': 'application/json',
			...(options.headers || {})
		}
	});
	const responseText = await response.text();
	let data;
	try {
		data = responseText ? JSON.parse(responseText) : null;
	} catch {
		data = null;
	}
	if (!response.ok) {
		const message = data?.message || data?.details || `Supabase returned HTTP ${response.status}`;
		const error = new Error(message);
		error.status = data?.code === 'P0001' ? 409 : response.status >= 500 ? 502 : response.status;
		throw error;
	}
	return data;
}

function validateProduct(product) {
	const categories = new Set(['wheels', 'audio', 'exterior', 'interior', 'tint', 'lights']);
	if (!product || typeof product !== 'object' || Array.isArray(product)) return 'Product must be an object';
	for (const field of ['name', 'category', 'description', 'meta', 'compatibility', 'image']) {
		if (typeof product[field] !== 'string' || !product[field].trim()) return `${field} is required`;
	}
	if (product.name.length > 160 || product.description.length > 2000 || product.meta.length > 500 || product.compatibility.length > 500) return 'A product text field is too long';
	if (!categories.has(product.category)) return 'Category is invalid';
	if (!Number.isSafeInteger(product.price) || product.price < 0) return 'Price must be a non-negative whole number';
	if (!Number.isSafeInteger(product.stock) || product.stock < 0) return 'Stock must be a non-negative whole number';
	if (typeof product.badge !== 'string' || product.badge.length > 40) return 'Badge must be 40 characters or fewer';
	try {
		const imageUrl = new URL(product.image);
		if (!['http:', 'https:'].includes(imageUrl.protocol)) return 'Image must use HTTP or HTTPS';
	} catch {
		return 'Image must be a valid URL';
	}
	return null;
}

function validateOrder(order) {
	if (!order || typeof order !== 'object' || Array.isArray(order)) return 'Order details are required';
	for (const [field, maxLength] of [['customerName', 120], ['phone', 40], ['address', 1000]]) {
		if (typeof order[field] !== 'string' || !order[field].trim()) return `${field} is required`;
		if (order[field].trim().length > maxLength) return `${field} is too long`;
	}
	if (!['Mobile Money', 'Bank transfer', 'Cash on delivery'].includes(order.payment)) return 'Choose a valid payment method';
	if (!Array.isArray(order.items) || order.items.length < 1 || order.items.length > 20) return 'An order must contain between 1 and 20 products';
	const productIds = new Set();
	for (const item of order.items) {
		if (!item || typeof item.productId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.productId)) return 'An order contains an invalid product';
		if (!Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) return 'Product quantity must be between 1 and 99';
		if (productIds.has(item.productId)) return 'Each product can only appear once in an order';
		productIds.add(item.productId);
	}
	return null;
}

function sendFile(request, response, pathname) {
	const requestedPath = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
	const publicFiles = new Set(['index.html', 'script.js', 'style.css']);
	if (!publicFiles.has(requestedPath)) {
		response.writeHead(404);
		response.end('Not found');
		return;
	}
	const resolvedPath = path.resolve(root, requestedPath);
	if (!resolvedPath.startsWith(`${root}${path.sep}`) && resolvedPath !== path.join(root, 'index.html')) {
		response.writeHead(403);
		response.end('Forbidden');
		return;
	}
	const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
	fs.readFile(resolvedPath, (error, content) => {
		if (error) {
			response.writeHead(error.code === 'ENOENT' ? 404 : 500);
			response.end(error.code === 'ENOENT' ? 'Not found' : 'Could not read file');
			return;
		}
		response.writeHead(200, { 'Content-Type': contentTypes[path.extname(resolvedPath)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
		response.end(content);
	});
}

const server = http.createServer(async (request, response) => {
	const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
	const pathname = requestUrl.pathname;
	try {
		if (request.method === 'GET' && pathname === '/api/health') {
			const configured = Boolean(supabaseUrl && serviceKey && adminEmail && adminPassword);
			json(response, configured ? 200 : 503, { status: configured ? 'ready' : 'needs-configuration', supabaseConfigured: Boolean(supabaseUrl && serviceKey), adminConfigured: Boolean(adminEmail && adminPassword) });
			return;
		}
		if (request.method === 'GET' && pathname === '/api/admin/session') {
			json(response, 200, { authenticated: Boolean(sessionFromRequest(request)) });
			return;
		}
		if (request.method === 'GET' && pathname === '/api/admin/dashboard') {
			if (!sessionFromRequest(request)) {
				json(response, 401, { error: 'Sign in with the configured admin email to view the dashboard.' });
				return;
			}
			const dashboard = await fs.promises.readFile(path.join(root, 'admin-dashboard.html'), 'utf8');
			response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
			response.end(dashboard);
			return;
		}
		if (request.method === 'POST' && pathname === '/api/admin/logout') {
			const token = sessionFromRequest(request);
			if (token) sessions.delete(token);
			const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
			json(response, 200, { authenticated: false }, { 'Set-Cookie': `torque_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}` });
			return;
		}
		if (request.method === 'POST' && pathname === '/api/admin/login') {
			if (!adminEmail || !adminPassword) {
				json(response, 503, { error: 'Set ADMIN_EMAIL and ADMIN_PASSWORD in .env before signing in.' });
				return;
			}
			const ip = request.socket.remoteAddress || 'unknown';
			const attempts = loginAttempts.get(ip) || { count: 0, resetAt: Date.now() + 60_000 };
			if (attempts.resetAt < Date.now()) {
				attempts.count = 0;
				attempts.resetAt = Date.now() + 60_000;
			}
			if (attempts.count >= 10) {
				json(response, 429, { error: 'Too many sign-in attempts. Wait one minute and try again.' });
				return;
			}
			attempts.count += 1;
			loginAttempts.set(ip, attempts);
			const credentials = await readJson(request);
			const emailMatches = typeof credentials.email === 'string' && safeEqual(credentials.email.trim().toLowerCase(), adminEmail);
			const passwordMatches = typeof credentials.password === 'string' && safeEqual(credentials.password, adminPassword);
			if (!emailMatches || !passwordMatches) {
				json(response, 401, { error: 'Access denied. Check your credentials and try again.' });
				return;
			}
			attempts.count = 0;
			const token = crypto.randomBytes(32).toString('hex');
			sessions.set(token, Date.now() + sessionLifetimeMs);
			const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
			json(response, 200, { authenticated: true }, { 'Set-Cookie': `torque_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${sessionLifetimeMs / 1000}${secure}` });
			return;
		}
		if (pathname.startsWith('/api/')) {
			if (request.method === 'POST' && pathname === '/api/admin/images') {
				if (!sessionFromRequest(request)) {
					json(response, 401, { error: 'Sign in as an administrator before uploading product images.' });
					return;
				}
				if (!supabaseUrl || !serviceKey) {
					json(response, 503, { error: 'Image storage is not configured.' });
					return;
				}
				const upload = await readJson(request, 7 * 1024 * 1024);
				const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
				if (!upload || typeof upload.data !== 'string' || !allowedTypes.has(upload.type)) {
					json(response, 400, { error: 'Choose a JPEG, PNG, WebP, or GIF image.' });
					return;
				}
				if (upload.data.length > 7 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(upload.data)) {
					json(response, 400, { error: 'The selected image could not be read.' });
					return;
				}
				const image = Buffer.from(upload.data, 'base64');
				if (!image.length || image.length > 5 * 1024 * 1024) {
					json(response, 413, { error: 'Images must be 5 MB or smaller.' });
					return;
				}
				if (!imageFormatMatches(image, upload.type)) {
					json(response, 400, { error: 'The selected file does not match its image format.' });
					return;
				}
				const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[upload.type];
				const filePath = `${crypto.randomUUID()}.${extension}`;
				const storageResponse = await fetch(`${supabaseUrl}/storage/v1/object/product-images/${filePath}`, {
					method: 'POST',
					headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': upload.type },
					body: image
				});
				if (!storageResponse.ok) {
					json(response, 502, { error: `Image upload failed (storage returned ${storageResponse.status}).` });
					return;
				}
				const imageUrl = `${supabaseUrl}/storage/v1/object/public/product-images/${filePath}`;
				json(response, 201, { path: filePath, url: imageUrl });
				return;
			}
			if (request.method === 'POST' && pathname === '/api/orders') {
				const ip = request.socket.remoteAddress || 'unknown';
				const attempts = orderAttempts.get(ip) || { count: 0, resetAt: Date.now() + 60_000 };
				if (attempts.resetAt < Date.now()) {
					attempts.count = 0;
					attempts.resetAt = Date.now() + 60_000;
				}
				if (attempts.count >= 10) {
					json(response, 429, { error: 'Too many order attempts. Wait one minute and try again.' });
					return;
				}
				attempts.count += 1;
				orderAttempts.set(ip, attempts);
				const order = await readJson(request);
				const validationError = validateOrder(order);
				if (validationError) {
					json(response, 400, { error: validationError });
					return;
				}
				const createdOrder = await supabaseRequest('rpc/create_order', {
					method: 'POST',
					body: JSON.stringify({
						p_customer_name: order.customerName.trim(),
						p_customer_phone: order.phone.trim(),
						p_delivery_address: order.address.trim(),
						p_payment_method: order.payment,
						p_items: order.items.map(item => ({ product_id: item.productId, quantity: item.quantity }))
					})
				});
				json(response, 201, createdOrder);
				return;
			}
			if (request.method === 'GET' && pathname === '/api/products') {
				const products = await supabaseRequest('products?select=*&order=created_at.asc');
				json(response, 200, products);
				return;
			}
			if (request.method === 'POST' && pathname === '/api/products') {
				if (!sessionFromRequest(request)) {
					json(response, 401, { error: 'Sign in as an administrator before changing inventory.' });
					return;
				}
				const product = await readJson(request);
				const validationError = validateProduct(product);
				if (validationError) {
					json(response, 400, { error: validationError });
					return;
				}
				const inserted = await supabaseRequest('products', {
					method: 'POST',
					headers: { Prefer: 'return=representation' },
					body: JSON.stringify(product)
				});
				json(response, 201, inserted[0]);
				return;
			}
			const productId = pathname.match(/^\/api\/products\/([0-9a-f-]+)$/i)?.[1];
			if (request.method === 'DELETE' && productId) {
				if (!sessionFromRequest(request)) {
					json(response, 401, { error: 'Sign in as an administrator before changing inventory.' });
					return;
				}
				const deleted = await supabaseRequest(`products?id=eq.${encodeURIComponent(productId)}&select=id`, {
					method: 'DELETE',
					headers: { Prefer: 'return=representation' }
				});
				if (!Array.isArray(deleted) || deleted.length === 0) {
					json(response, 404, { error: 'Product was not found. Refresh inventory and try again.' });
					return;
				}
				json(response, 200, { deleted: true, id: productId });
				return;
			}
			json(response, 404, { error: 'API route not found' });
			return;
		}
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			response.writeHead(405, { Allow: 'GET, HEAD' });
			response.end();
			return;
		}
		sendFile(request, response, pathname);
	} catch (error) {
		console.error(`${request.method} ${pathname}: ${error.message}`);
		json(response, error.status || (error instanceof SyntaxError ? 400 : 502), { error: error instanceof SyntaxError ? 'Request body must be valid JSON' : error.message });
	}
});

server.listen(port, () => {
	console.log(`Auto Customs backend listening on http://localhost:${port}`);
	if (!supabaseUrl || !serviceKey) console.warn('Supabase is not configured; add the values to .env before using the inventory API.');
	if (!adminEmail || !adminPassword) console.warn('Admin credentials are not configured; set ADMIN_EMAIL and ADMIN_PASSWORD in .env.');
});
