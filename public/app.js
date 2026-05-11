const productGrid = document.querySelector("#productGrid");
const categoryFilter = document.querySelector("#categoryFilter");
const cartToggle = document.querySelector("#cartToggle");
const closeCart = document.querySelector("#closeCart");
const cartDrawer = document.querySelector("#cartDrawer");
const scrim = document.querySelector("#scrim");
const cartCount = document.querySelector("#cartCount");
const cartItems = document.querySelector("#cartItems");
const subtotalEl = document.querySelector("#subtotal");
const shippingEl = document.querySelector("#shipping");
const taxEl = document.querySelector("#tax");
const totalEl = document.querySelector("#total");
const checkoutForm = document.querySelector("#checkoutForm");
const formMessage = document.querySelector("#formMessage");

let products = [];
let cart = JSON.parse(localStorage.getItem("marketlane-cart") || "[]");

const formatMoney = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

function saveCart() {
  localStorage.setItem("marketlane-cart", JSON.stringify(cart));
}

function getTotals() {
  const subtotal = cart.reduce((sum, item) => {
    const product = products.find((candidate) => candidate.id === item.id);
    return product ? sum + product.price * item.quantity : sum;
  }, 0);
  const shipping = subtotal === 0 || subtotal >= 120 ? 0 : 9;
  const tax = Math.round(subtotal * 0.0725 * 100) / 100;
  const total = subtotal + shipping + tax;
  return { subtotal, shipping, tax, total };
}

function openCart() {
  cartDrawer.classList.add("open");
  scrim.classList.add("open");
  cartDrawer.setAttribute("aria-hidden", "false");
}

function closeCartDrawer() {
  cartDrawer.classList.remove("open");
  scrim.classList.remove("open");
  cartDrawer.setAttribute("aria-hidden", "true");
}

function updateCart(id, quantity) {
  const existing = cart.find((item) => item.id === id);

  if (!existing && quantity > 0) {
    cart.push({ id, quantity });
  } else if (existing) {
    existing.quantity += quantity;
  }

  cart = cart.filter((item) => item.quantity > 0);
  saveCart();
  renderCart();
}

function renderProducts() {
  const selectedCategory = categoryFilter.value;
  const filteredProducts =
    selectedCategory === "All"
      ? products
      : products.filter((product) => product.category === selectedCategory);

  productGrid.innerHTML = filteredProducts
    .map(
      (product) => `
        <article class="product-card">
          <img src="${product.image}" alt="${product.name}">
          <div class="product-content">
            <div class="product-meta">
              <span>${product.category}</span>
              <span>${product.rating} stars</span>
            </div>
            <h3>${product.name}</h3>
            <p>${product.description}</p>
            <div class="product-buy">
              <span class="price">${formatMoney(product.price)}</span>
              <button type="button" data-add="${product.id}">Add</button>
            </div>
          </div>
        </article>
      `
    )
    .join("");
}

function renderCart() {
  const enrichedCart = cart
    .map((item) => ({
      ...item,
      product: products.find((product) => product.id === item.id)
    }))
    .filter((item) => item.product);

  cartCount.textContent = enrichedCart.reduce((sum, item) => sum + item.quantity, 0);

  cartItems.innerHTML = enrichedCart.length
    ? enrichedCart
        .map(
          (item) => `
            <div class="cart-line">
              <div>
                <h3>${item.product.name}</h3>
                <p>${formatMoney(item.product.price)} each</p>
              </div>
              <div class="quantity-controls" aria-label="Quantity controls for ${item.product.name}">
                <button type="button" data-minus="${item.id}">-</button>
                <strong>${item.quantity}</strong>
                <button type="button" data-plus="${item.id}">+</button>
              </div>
            </div>
          `
        )
        .join("")
    : "<p>Your cart is empty.</p>";

  const totals = getTotals();
  subtotalEl.textContent = formatMoney(totals.subtotal);
  shippingEl.textContent = totals.shipping ? formatMoney(totals.shipping) : "Free";
  taxEl.textContent = formatMoney(totals.tax);
  totalEl.textContent = formatMoney(totals.total);
}

async function loadProducts() {
  const response = await fetch("/api/products");
  const data = await response.json();
  products = data.products;

  const categories = ["All", ...new Set(products.map((product) => product.category))];
  categoryFilter.innerHTML = categories
    .map((category) => `<option value="${category}">${category}</option>`)
    .join("");

  renderProducts();
  renderCart();
}

productGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add]");
  if (!button) return;

  updateCart(button.dataset.add, 1);
  openCart();
});

cartItems.addEventListener("click", (event) => {
  const plus = event.target.closest("[data-plus]");
  const minus = event.target.closest("[data-minus]");

  if (plus) updateCart(plus.dataset.plus, 1);
  if (minus) updateCart(minus.dataset.minus, -1);
});

categoryFilter.addEventListener("change", renderProducts);
cartToggle.addEventListener("click", openCart);
closeCart.addEventListener("click", closeCartDrawer);
scrim.addEventListener("click", closeCartDrawer);

checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  formMessage.textContent = "";

  if (!cart.length) {
    formMessage.textContent = "Add at least one product before checking out.";
    openCart();
    return;
  }

  const formData = new FormData(checkoutForm);
  const payload = {
    customer: Object.fromEntries(formData.entries()),
    items: cart
  };

  const response = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();

  if (!response.ok) {
    formMessage.textContent = data.error || "Order failed. Please try again.";
    return;
  }

  cart = [];
  saveCart();
  renderCart();
  checkoutForm.reset();
  closeCartDrawer();
  formMessage.textContent = `Order ${data.order.id} placed. Total: ${formatMoney(data.order.total)}.`;
});

loadProducts().catch(() => {
  productGrid.innerHTML = "<p>Products could not be loaded.</p>";
});
