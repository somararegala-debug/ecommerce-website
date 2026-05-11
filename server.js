const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

const products = [
  {
    id: "linen-jacket",
    name: "Linen Weekender Jacket",
    category: "Apparel",
    price: 84,
    rating: 4.8,
    image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80",
    description: "Lightweight layers with a structured fit for everyday travel."
  },
  {
    id: "ceramic-mug",
    name: "Studio Ceramic Mug",
    category: "Home",
    price: 28,
    rating: 4.6,
    image: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=900&q=80",
    description: "Hand-finished stoneware with a satin glaze and generous handle."
  },
  {
    id: "leather-tote",
    name: "Everyday Leather Tote",
    category: "Bags",
    price: 148,
    rating: 4.9,
    image: "https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=900&q=80",
    description: "A roomy carryall with laptop space, interior pockets, and brass hardware."
  },
  {
    id: "wireless-speaker",
    name: "Compact Wireless Speaker",
    category: "Tech",
    price: 76,
    rating: 4.7,
    image: "https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=900&q=80",
    description: "Portable sound with a clean aluminum shell and all-day battery."
  },
  {
    id: "desk-lamp",
    name: "Arc Desk Lamp",
    category: "Home",
    price: 62,
    rating: 4.5,
    image: "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=80",
    description: "Dimmable warm light for focused work, reading, and late-night orders."
  },
  {
    id: "canvas-sneaker",
    name: "Canvas Court Sneaker",
    category: "Footwear",
    price: 69,
    rating: 4.4,
    image: "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?auto=format&fit=crop&w=900&q=80",
    description: "Low-profile sneakers with cushioned insoles and durable canvas."
  }
];

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(ORDERS_FILE);
  } catch {
    await fs.writeFile(ORDERS_FILE, "[]\n", "utf8");
  }
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
    if (Buffer.concat(chunks).length > 1_000_000) {
      throw new Error("Request body too large");
    }
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function money(value) {
  return Math.round(value * 100) / 100;
}

function buildOrder(payload) {
  const customer = payload.customer || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  const normalizedItems = items
    .map((item) => {
      const product = products.find((candidate) => candidate.id === item.id);
      const quantity = Number(item.quantity);

      if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 12) {
        return null;
      }

      return {
        id: product.id,
        name: product.name,
        price: product.price,
        quantity,
        lineTotal: money(product.price * quantity)
      };
    })
    .filter(Boolean);

  if (!normalizedItems.length) {
    throw new Error("Your cart is empty.");
  }

  if (!customer.name || !customer.email || !customer.address) {
    throw new Error("Name, email, and shipping address are required.");
  }

  const subtotal = normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const shipping = subtotal >= 120 ? 0 : 9;
  const tax = money(subtotal * 0.0725);
  const total = money(subtotal + shipping + tax);

  return {
    id: `ORD-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    customer: {
      name: String(customer.name).trim(),
      email: String(customer.email).trim(),
      address: String(customer.address).trim()
    },
    items: normalizedItems,
    subtotal: money(subtotal),
    shipping,
    tax,
    total
  };
}

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/products") {
    sendJson(res, 200, { products });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/orders") {
    try {
      await ensureDataFile();
      const payload = await readJsonBody(req);
      const order = buildOrder(payload);
      const orders = JSON.parse(await fs.readFile(ORDERS_FILE, "utf8"));
      orders.push(order);
      await fs.writeFile(ORDERS_FILE, `${JSON.stringify(orders, null, 2)}\n`, "utf8");
      sendJson(res, 201, { order });
    } catch (error) {
      sendJson(res, 400, { error: error.message || "Unable to place order." });
    }
    return true;
  }

  return false;
}

async function serveStatic(req, res, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
    res.end(file);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    const handled = await handleApi(req, res, url);
    if (!handled) {
      await serveStatic(req, res, url);
    }
  } catch (error) {
    sendJson(res, 500, { error: "Something went wrong on the server." });
  }
});

ensureDataFile().then(() => {
  server.listen(PORT, () => {
    console.log(`MarketLane running at http://localhost:${PORT}`);
  });
});
