let vistActual = "dashboard";

document.addEventListener("DOMContentLoaded", async () => {
  const sb = window.supabaseClient;
  if (!sb) {
    console.error("Supabase client no inicializado");
    window.location.replace("login.html");
    return;
  }
  try {
    await window.requireAuth("login.html");
  } catch (err) {
    console.error(err);
    window.location.replace("login.html");
    return;
  }
  window.watchAuthRedirect("login.html");
  const t = window.SUPABASE_TABLES || { ventas: "venta", instalacion: "instalacion", gastos: "gasto", mercancia: "mercancia" };
  const st = { ventas: [], instalacion: [], gastos: [], mercancia: [] };
  let instEditClickBound = false;
  let ventasEditClickBound = false;
  let ventasItemsClickBound = false;
  let ventasCreateInstClickBound = false;
  let mercanciaEditClickBound = false;
  let ventasVistaCache = [];
  const charts = {};

  const q = (s) => document.querySelector(s);
  const txt = (s) => String(s || "").trim();
  const today = () => new Date().toISOString().slice(0, 10);
  const tipoGasto = (x) => ({ "1": "Gasto", "2": "Capital Inicial", "3": "Ingreso", "4": "Reembolso", "5": "Transferencia" }[String(x)] || "Otros");
  const intFmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
  const fmtInt = (n) => intFmt.format(Math.round(Number(n || 0)));
  const money = (n) => `$${fmtInt(n)}`;
  const animateCounter = (element, value) => {
    if (!element) return;
    const target = Number(value || 0);
    const type = element.dataset.counterType || "number";
    const duration = 700;
    const start = performance.now();
    const paint = (num) => { element.textContent = type === "money" ? money(num) : fmtInt(num); };
    const frame = (ts) => {
      const p = Math.min((ts - start) / duration, 1);
      paint(target * p);
      if (p < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  };
  const val = (obj, ...keys) => {
    for (const key of keys) {
      if (obj && obj[key] != null) return obj[key];
    }
    return "";
  };
  const asDay = (v) => String(v || "").slice(0, 10);
  const normalizeMercanciaDesc = (producto, descripcion) => {
    const p = String(producto || "").trim();
    const d = String(descripcion || "").trim();
    if (p && d) return `${p} | ${d}`;
    return p || d;
  };
  const splitMercanciaDesc = (descripcion) => {
    const raw = String(descripcion || "");
    const [producto, ...rest] = raw.split("|");
    return {
      producto: (producto || "").trim() || "-",
      descripcion: rest.join("|").trim() || raw.trim() || "-"
    };
  };
  const canonProducto = (raw) => {
    let s = String(raw || "").toLowerCase().trim();
    if (!s) return "Sin producto";
    // Normaliza acentos y caracteres raros
    s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    // Corrige errores tipicos de digitacion
    s = s.replace(/\bpaple\b/g, "papel");
    s = s.replace(/\bcolgaduraa?\b/g, "colgadura");
    s = s.replace(/\bcolgadrua\b/g, "colgadura");
    s = s.replace(/\bde\s+colgadura\b/g, "de colgadura");
    // Limpia separadores y espacios
    s = s.replace(/[_\-\/.,;:]+/g, " ").replace(/\s+/g, " ").trim();
    // Reglas de unificacion por familia
    if (s.includes("papel") && s.includes("colgadura")) return "Papel de colgadura";
    if (s.includes("vinilo")) return "Vinilo";
    if (s.includes("cenefa")) return "Cenefa";
    if (s.includes("pegante") || s.includes("adhesivo")) return "Pegante";
    // Titulo por defecto
    return s.split(" ").map((w) => w ? `${w[0].toUpperCase()}${w.slice(1)}` : "").join(" ");
  };
  const numeroInstalador = "3106128451";
  const abrirWhatsApp = (numero, mensaje) => {
    const numLimpio = String(numero || "").replace(/\D/g, "");
    const enlace = `https://wa.me/+57${numLimpio}?text=${encodeURIComponent(mensaje)}`;
    window.open(enlace, "_blank");
  };
  const mensajeCliente = (cliente, fecha, ubicacion, producto) => {
    return `Hola ${cliente}

Le confirmamos que su instalación ha sido programada exitosamente con **Alcop**.

Fecha: ${fecha}  
Direccion: ${ubicacion}  
Producto/Servicio: ${producto}

Nuestro equipo se comunicará con usted el día anterior a la instalación para confirmar la hora exacta y resolver cualquier duda.

Gracias por confiar en **Alcop**. Estamos comprometidos con ofrecerle un servicio profesional y de calidad.`;
  };
  const mensajeInstalador = (cliente, telefono, ubicacion, producto, fecha) => {
    return `NUEVA INSTALACION PROGRAMADA - **Alcop**

Cliente: ${cliente}  
Teléfono cliente: ${telefono}  

Dirección: ${ubicacion}  
Producto/Servicio: ${producto}  
Fecha instalación: ${fecha}

Por favor, asegúrese de verificar todos los materiales y coordinar la logística necesaria antes de la instalación.

Gracias por su compromiso y profesionalismo.`;
  };
  const alertx = (m, type = "info") => {
    if (window.Swal) {
      window.Swal.fire({
        toast: true,
        position: "top-end",
        showConfirmButton: false,
        timer: 2200,
        timerProgressBar: true,
        icon: type === "error" ? "error" : type === "warning" ? "warning" : type === "success" ? "success" : "info",
        title: m
      });
      return;
    }
    const c = q("#alertasContainer") || (() => { const d = document.createElement("div"); d.id = "alertasContainer"; d.className = "position-fixed top-0 end-0 p-3"; d.style.zIndex = "9999"; document.body.appendChild(d); return d; })();
    const e = document.createElement("div");
    e.className = `alert alert-${type === "error" ? "danger" : type} shadow-sm mb-2`;
    e.textContent = m;
    c.appendChild(e);
    setTimeout(() => e.remove(), 3500);
  };
  const logHistory = (module, action, payload = {}) => {
    const key = "historial_cambios";
    const base = JSON.parse(localStorage.getItem(key) || "[]");
    base.unshift({ module, action, payload, at: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(base.slice(0, 500)));
  };
  const normalizeSortVal = (v) => {
    const t2 = String(v || "").trim();
    const n = Number(t2.replace(/[^\d.-]/g, ""));
    if (!Number.isNaN(n) && t2.match(/[\d]/)) return n;
    const d = Date.parse(t2);
    if (!Number.isNaN(d) && t2.match(/\d{4}-\d{2}-\d{2}/)) return d;
    return t2.toLowerCase();
  };
  const tablePager = new WeakMap();
  const getPagerRows = (table) => {
    const tbody = table?.querySelector("tbody");
    if (!tbody) return [];
    return [...tbody.querySelectorAll("tr")];
  };
  const renderTablePagination = (table) => {
    const state = tablePager.get(table);
    if (!state) return;
    const allRows = getPagerRows(table);
    const filteredRows = allRows.filter((r) => r.dataset.filterHidden !== "1");
    const totalRows = filteredRows.length;
    const totalPages = Math.max(Math.ceil(totalRows / state.pageSize), 1);
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * state.pageSize;
    const end = start + state.pageSize;

    allRows.forEach((r) => { r.style.display = "none"; });
    filteredRows.slice(start, end).forEach((r) => { r.style.display = ""; });

    if (!state.infoEl || !state.listEl) return;
    const from = totalRows ? start + 1 : 0;
    const to = Math.min(end, totalRows);
    state.infoEl.textContent = `Mostrando ${fmtInt(from)}-${fmtInt(to)} de ${fmtInt(totalRows)}`;
    state.listEl.innerHTML = "";

    const addBtn = (label, page, disabled = false, active = false) => {
      const li = document.createElement("li");
      li.className = `page-item${disabled ? " disabled" : ""}${active ? " active" : ""}`;
      li.innerHTML = `<button class="page-link" type="button">${label}</button>`;
      if (!disabled) {
        li.querySelector("button").addEventListener("click", () => {
          state.page = page;
          renderTablePagination(table);
        });
      }
      state.listEl.appendChild(li);
    };
    addBtn("«", Math.max(state.page - 1, 1), state.page === 1);
    const windowStart = Math.max(state.page - 2, 1);
    const windowEnd = Math.min(windowStart + 4, totalPages);
    for (let p = windowStart; p <= windowEnd; p += 1) addBtn(String(p), p, false, p === state.page);
    addBtn("»", Math.min(state.page + 1, totalPages), state.page === totalPages);
  };
  const ensureTablePagination = (table, moduleKey, pageSize = 10) => {
    if (!table) return;
    const wrapHost = table.closest(".table-responsive") || table.parentElement;
    if (!wrapHost) return;
    let state = tablePager.get(table);
    if (!state) {
      const footer = document.createElement("div");
      footer.className = "d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 px-3 py-2 border-top bg-light";
      footer.innerHTML = `<small class="text-muted table-page-info">Mostrando 0-0 de 0</small><nav><ul class="pagination pagination-sm mb-0 table-page-list"></ul></nav>`;
      wrapHost.insertAdjacentElement("afterend", footer);
      state = {
        moduleKey,
        page: 1,
        pageSize,
        infoEl: footer.querySelector(".table-page-info"),
        listEl: footer.querySelector(".table-page-list")
      };
      tablePager.set(table, state);
    }
    state.pageSize = pageSize;
    renderTablePagination(table);
  };
  const resetAndPaginate = (table) => {
    const state = tablePager.get(table);
    if (state) state.page = 1;
    renderTablePagination(table);
  };
  const enableTableSort = (table) => {
    if (!table || table.dataset.sortReady) return;
    const ths = table.querySelectorAll("thead th");
    ths.forEach((th, idx) => {
      th.style.cursor = "pointer";
      th.title = "Ordenar";
      th.addEventListener("click", () => {
        const tbody = table.querySelector("tbody");
        if (!tbody) return;
        const rows = [...tbody.querySelectorAll("tr")];
        const asc = th.dataset.asc !== "1";
        th.dataset.asc = asc ? "1" : "0";
        rows.sort((a, b) => {
          const av = normalizeSortVal(a.children[idx]?.innerText || "");
          const bv = normalizeSortVal(b.children[idx]?.innerText || "");
          if (av < bv) return asc ? -1 : 1;
          if (av > bv) return asc ? 1 : -1;
          return 0;
        });
        tbody.innerHTML = "";
        rows.forEach((r) => tbody.appendChild(r));
        renderTablePagination(table);
      });
    });
    table.dataset.sortReady = "1";
  };
  const exportTableExcel = (table, fileName) => {
    if (!window.XLSX || !table) return alertx("No se pudo exportar a Excel", "error");
    const wb = window.XLSX.utils.table_to_book(table, { sheet: "Reporte" });
    window.XLSX.writeFile(wb, `${fileName}_${today()}.xlsx`);
  };
  const exportTablePdf = (table, title) => {
    if (!window.jspdf || !window.jspdf.jsPDF || !table) return alertx("No se pudo exportar a PDF", "error");
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.text(title, 14, 12);
    doc.autoTable({ html: table, startY: 16, styles: { fontSize: 7 } });
    doc.save(`${title.replace(/\s+/g, "_").toLowerCase()}_${today()}.pdf`);
  };
  const mountTableTools = (moduleKey) => {
    const table = q("#datatablesSimple") || q("#carteraTabla")?.closest("table");
    const host = q(".toolbar-responsive") || q("#btnExportarCartera")?.closest(".row");
    if (!table || !host) return;
    enableTableSort(table);
    if (host.querySelector(".export-tools")) return;
    const wrap = document.createElement("div");
    wrap.className = "btn-group export-tools";
    wrap.innerHTML = `<button class="btn btn-outline-success" type="button" id="btnExcel_${moduleKey}"><i class="fas fa-file-excel me-2"></i>Excel</button><button class="btn btn-outline-danger" type="button" id="btnPdf_${moduleKey}"><i class="fas fa-file-pdf me-2"></i>PDF</button>`;
    host.appendChild(wrap);
    q(`#btnExcel_${moduleKey}`)?.addEventListener("click", () => exportTableExcel(table, moduleKey));
    q(`#btnPdf_${moduleKey}`)?.addEventListener("click", () => exportTablePdf(table, `Reporte ${moduleKey}`));
    ensureTablePagination(table, moduleKey, 10);
  };

  async function load(k) {
    const { data, error } = await sb.from(t[k]).select("*").order("created_at", { ascending: false });
    if (error) { console.error(error); alertx(`Error cargando ${k}: ${error.message}`, "error"); st[k] = []; return; }
    st[k] = data || [];
  }
  async function ins(k, p) {
    const { error } = await sb.from(t[k]).insert([p]);
    if (error) throw error;
    logHistory(k, "crear", p);
    await load(k);
  }
  async function upd(k, id, p) {
    const { error } = await sb.from(t[k]).update(p).eq("id", id);
    if (error) throw error;
    logHistory(k, "editar", { id, ...p });
    await load(k);
  }

  function buscador(inputId, tableId) {
    const i = q(`#${inputId}`), table = q(`#${tableId}`);
    if (!i || !table) return;
    i.onkeyup = () => {
      const f = i.value.toLowerCase();
      table.querySelectorAll("tbody tr").forEach((r) => {
        r.dataset.filterHidden = r.innerText.toLowerCase().includes(f) ? "0" : "1";
      });
      resetAndPaginate(table);
    };
  }

  async function modVentas() {
    await load("ventas");
    const form = q("#dataForm"), body = q("#datatablesSimple tbody");
    if (!form || !body) return;
    const editForm = q("#editVentaForm");
    const modalEl = q("#editarVentaModal");
    const modal = modalEl && window.bootstrap ? window.bootstrap.Modal.getOrCreateInstance(modalEl) : null;
    const btnAgregar = q("#btnAgregarProducto");
    const carritoBody = q("#carritoVentasBody");
    const carritoTotalEl = q("#carritoTotalGeneral");
    const carritoCantidadEl = q("#carritoCantidad");
    let carritoProductos = [];

    const renderCarrito = () => {
      if (!carritoBody) return;
      if (!carritoProductos.length) {
        carritoBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No hay productos agregados</td></tr>';
      } else {
        carritoBody.innerHTML = carritoProductos.map((item, i) =>
          `<tr><td>${item.producto}</td><td>${item.descripcion || "-"}</td><td>${fmtInt(item.cantidad)}</td><td>${money(item.precio)}</td><td>${money(item.subtotal)}</td><td><button type="button" class="btn btn-sm btn-outline-danger quitar-item-btn" data-i="${i}"><i class="fas fa-trash"></i></button></td></tr>`
        ).join("");
      }
      const total = carritoProductos.reduce((s, x) => s + Number(x.subtotal || 0), 0);
      if (carritoTotalEl) carritoTotalEl.textContent = money(total);
      if (carritoCantidadEl) carritoCantidadEl.textContent = fmtInt(carritoProductos.length);
    };

    const limpiarCarrito = () => {
      carritoProductos = [];
      renderCarrito();
    };

    if (btnAgregar && !btnAgregar.dataset.bound) {
      btnAgregar.addEventListener("click", () => {
        const producto = txt(q("#producto")?.value);
        const descripcion = txt(q("#referencia")?.value);
        const cantidad = Number(q("#cantidad")?.value || 0);
        const precio = Number(q("#precio")?.value || 0);
        if (!producto) return alertx("Ingresa el producto", "warning");
        if (!cantidad || cantidad <= 0) return alertx("Cantidad invalida", "warning");
        if (!precio || precio <= 0) return alertx("Precio invalido", "warning");
        carritoProductos.push({ producto, descripcion, cantidad, precio, subtotal: cantidad * precio });
        if (q("#producto")) q("#producto").value = "";
        if (q("#referencia")) q("#referencia").value = "";
        if (q("#cantidad")) q("#cantidad").value = "";
        if (q("#precio")) q("#precio").value = "";
        renderCarrito();
        alertx("Producto agregado al carrito", "success");
      });
      btnAgregar.dataset.bound = "1";
    }

    if (carritoBody && !carritoBody.dataset.bound) {
      carritoBody.addEventListener("click", (e) => {
        const btn = e.target.closest(".quitar-item-btn");
        if (!btn) return;
        const i = Number(btn.dataset.i);
        carritoProductos.splice(i, 1);
        renderCarrito();
      });
      carritoBody.dataset.bound = "1";
    }

    form.onsubmit = async (e) => {
      e.preventDefault();
      if (!carritoProductos.length) return alertx("Agrega al menos un producto al carrito", "warning");
      try {
        const fecha = q("#fecha").value;
        const numeroRecibo = txt(q("#numeroRecibo")?.value);
        const numeroPedido = txt(q("#numeroPedido")?.value);
        const abono = Number(q("#abono").value || 0);
        const metodoPago = q("#metodoPago").value;
        const vendedor = q("#vendedor").value;
        const cliente = q("#cliente").value;
        const telefono = txt(q("#telefono")?.value);
        const ubicacion = q("#ub").value;
        const fechaProgramada = q("#fechaProgramada").value;
        for (let idx = 0; idx < carritoProductos.length; idx += 1) {
          const item = carritoProductos[idx];
          await ins("ventas", {
            fecha,
            numero_recibo: numeroRecibo,
            numero_pedido: numeroPedido,
            producto: item.producto,
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            precio: item.precio,
            abono: idx === 0 ? abono : 0,
            metodo_pago: metodoPago,
            vendedor,
            cliente,
            telefono,
            ubicacion_cliente: ubicacion,
            fecha_programacion: fechaProgramada,
            total: item.cantidad * item.precio
          });
        }
        form.reset();
        limpiarCarrito();
        renderVentas();
        if (window.Swal) {
          await window.Swal.fire({ icon: "success", title: "Venta registrada correctamente", timer: 1800, showConfirmButton: false });
        } else {
          alertx("Venta registrada correctamente", "success");
        }
      } catch (err) { alertx(err.message || "No se pudo guardar venta", "error"); }
    };
    form.addEventListener("reset", () => setTimeout(() => limpiarCarrito(), 0));
    if (editForm && !editForm.dataset.bound) {
      editForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = q("#editVentaId")?.value;
        if (!id) return;
        const cantidad = Number(q("#editVentaCantidad").value || 0);
        const precio = Number(q("#editVentaPrecio").value || 0);
        try {
          await upd("ventas", id, {
            fecha: q("#editVentaFecha").value,
            numero_recibo: txt(q("#editVentaNumeroRecibo")?.value),
            numero_pedido: txt(q("#editVentaNumeroPedido")?.value),
            producto: q("#editVentaProducto").value,
            descripcion: q("#editVentaReferencia").value,
            cantidad,
            precio,
            abono: Number(q("#editVentaAbono").value || 0),
            metodo_pago: q("#editVentaMetodoPago").value,
            vendedor: q("#editVentaVendedor").value,
            telefono: txt(q("#editVentaTelefono")?.value),
            fecha_programacion: q("#editVentaFechaProgramada").value,
            total: cantidad * precio
          });
          renderVentas();
          if (modal) modal.hide();
          alertx("Venta actualizada", "success");
        } catch (err) {
          alertx(err.message || "No se pudo actualizar venta", "error");
        }
      };
      editForm.dataset.bound = "1";
    }
    if (!ventasEditClickBound) {
      document.addEventListener("click", (e) => {
        const btn = e.target.closest(".edit-venta-btn");
        if (!btn) return;
        const item = st.ventas.find((x) => String(x.id) === String(btn.dataset.id));
        if (!item) return;
        if (q("#editVentaId")) q("#editVentaId").value = item.id;
        if (q("#editVentaFecha")) q("#editVentaFecha").value = val(item, "fecha") || "";
        if (q("#editVentaNumeroRecibo")) q("#editVentaNumeroRecibo").value = val(item, "numero_recibo", "numeroRecibo") || "";
        if (q("#editVentaNumeroPedido")) q("#editVentaNumeroPedido").value = val(item, "numero_pedido", "numeroPedido") || "";
        if (q("#editVentaProducto")) q("#editVentaProducto").value = val(item, "producto") || "";
        if (q("#editVentaReferencia")) q("#editVentaReferencia").value = val(item, "descripcion", "referencia") || "";
        if (q("#editVentaCantidad")) q("#editVentaCantidad").value = Number(val(item, "cantidad") || 0);
        if (q("#editVentaPrecio")) q("#editVentaPrecio").value = Number(val(item, "precio") || 0);
        if (q("#editVentaAbono")) q("#editVentaAbono").value = Number(val(item, "abono") || 0);
        if (q("#editVentaMetodoPago")) q("#editVentaMetodoPago").value = val(item, "metodo_pago", "metodoPago") || "";
        if (q("#editVentaVendedor")) q("#editVentaVendedor").value = val(item, "vendedor") || "";
        if (q("#editVentaTelefono")) q("#editVentaTelefono").value = val(item, "telefono") || "";
        if (q("#editVentaFechaProgramada")) q("#editVentaFechaProgramada").value = val(item, "fecha_programacion", "fecha_programada", "fechaProgramada") || "";
        const currentModalEl = q("#editarVentaModal");
        const currentModal = currentModalEl && window.bootstrap ? window.bootstrap.Modal.getOrCreateInstance(currentModalEl) : null;
        if (currentModal) currentModal.show();
      }, { passive: true });
      ventasEditClickBound = true;
    }
    if (!ventasItemsClickBound) {
      document.addEventListener("click", (e) => {
        const btn = e.target.closest(".ver-items-venta-btn");
        if (!btn) return;
        const idx = Number(btn.dataset.idx);
        const item = ventasVistaCache[idx];
        if (!item) return;
        const rows = (item.items || []).map((x) =>
          `<tr><td>${x.producto || "-"}</td><td>${x.descripcion || "-"}</td><td>${fmtInt(x.cantidad)}</td><td>${money(x.precio)}</td><td>${money(x.subtotal)}</td></tr>`
        ).join("");
        const html = `<div class="table-responsive"><table class="table table-sm table-bordered mb-0"><thead class="table-light"><tr><th>Producto</th><th>Descripcion</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="text-center text-muted">Sin productos</td></tr>'}</tbody></table></div>`;
        if (window.Swal) {
          window.Swal.fire({
            title: `Detalle del pedido ${item.numeroPedido || "-"}`,
            html,
            width: 900,
            confirmButtonText: "Cerrar"
          });
        } else {
          alertx("No se pudo abrir detalle (SweetAlert no disponible)", "warning");
        }
      }, { passive: true });
      ventasItemsClickBound = true;
    }
    if (!ventasCreateInstClickBound) {
      document.addEventListener("click", (e) => {
        const btn = e.target.closest(".create-inst-from-sale-btn");
        if (!btn) return;
        const idx = Number(btn.dataset.idx);
        const item = ventasVistaCache[idx];
        if (!item) return;
        const payload = {
          cliente: item.cliente || "",
          telefono: item.telefono || "",
          ubicacion: item.ubicacion || "",
          producto: item.productos?.join(", ") || "",
          descripcion: item.descripciones?.join(", ") || "",
          numero_pedido: item.numeroPedido || ""
        };
        localStorage.setItem("ventaParaInstalacion", JSON.stringify(payload));
        change("instalacion-form");
      }, { passive: true });
      ventasCreateInstClickBound = true;
    }
    renderCarrito();
    renderVentas(); buscador("buscadorVentas", "datatablesSimple"); mountTableTools("ventas");
  }
  function renderVentas() {
    const body = q("#datatablesSimple tbody"); if (!body) return;
    const grupos = new Map();
    st.ventas.forEach((v, idx) => {
      const numeroPedido = String(val(v, "numero_pedido", "numeroPedido") || "").trim();
      const numeroRecibo = String(val(v, "numero_recibo", "numeroRecibo") || "").trim();
      const clienteKey = String(val(v, "cliente") || "").trim().toLowerCase();
      const key = numeroPedido
        ? `pedido:${numeroPedido}|cliente:${clienteKey}`
        : (numeroRecibo ? `recibo:${numeroRecibo}|cliente:${clienteKey}` : `item:${val(v, "id") || idx}`);
      const cantidad = Number(val(v, "cantidad") || 0);
      const precio = Number(val(v, "precio") || 0);
      const subtotal = cantidad * precio;
      const abono = Number(val(v, "abono") || 0);
      const producto = String(val(v, "producto") || "").trim();
      const descripcion = String(val(v, "descripcion", "referencia") || "").trim();

      if (!grupos.has(key)) {
        grupos.set(key, {
          id: val(v, "id"),
          fecha: val(v, "fecha") || "-",
          numeroRecibo: numeroRecibo || "-",
          numeroPedido: numeroPedido || "-",
          productos: [],
          descripciones: [],
          cantidad: 0,
          total: 0,
          abono: abono,
          metodoPago: val(v, "metodo_pago", "metodoPago") || "-",
          vendedor: val(v, "vendedor") || "-",
          cliente: val(v, "cliente") || "-",
          telefono: val(v, "telefono") || "-",
          ubicacion: val(v, "ubicacion_cliente", "ub") || "-",
          fechaProgramacion: val(v, "fecha_programacion", "fecha_programada", "fechaProgramada") || "-",
          items: []
        });
      }

      const g = grupos.get(key);
      g.cantidad += cantidad;
      g.total += subtotal;
      g.abono = Math.max(Number(g.abono || 0), abono);
      if (producto && !g.productos.includes(producto)) g.productos.push(producto);
      if (descripcion && !g.descripciones.includes(descripcion)) g.descripciones.push(descripcion);
      g.items.push({ producto, descripcion, cantidad, precio, subtotal });
    });

    const ventasVista = Array.from(grupos.values());
    ventasVistaCache = ventasVista;
    body.innerHTML = ventasVista.map((v, idx) => {
      const saldo = v.total - Number(v.abono || 0);
      const productoTxt = v.productos.length > 1 ? `${v.productos[0]} (+${v.productos.length - 1})` : (v.productos[0] || "-");
      const descTxt = v.descripciones.length > 1 ? `${v.descripciones[0]} (+${v.descripciones.length - 1})` : (v.descripciones[0] || "-");
      const precioProm = v.cantidad > 0 ? (v.total / v.cantidad) : 0;
      return `<tr class="${saldo <= 0 ? "table-success" : ""}"><td>${v.fecha}</td><td>${v.numeroRecibo}</td><td>${v.numeroPedido}</td><td>${productoTxt}</td><td>${descTxt}</td><td>${fmtInt(v.cantidad)}</td><td>${money(precioProm)}</td><td>${money(v.abono)}</td><td>${v.metodoPago}</td><td>${v.vendedor}</td><td>${v.cliente}</td><td>${v.telefono}</td><td>${v.ubicacion}</td><td>${v.fechaProgramacion}</td><td>${money(v.total)}</td><td><div class="d-flex gap-2"><div class="btn-group-vertical btn-group-sm" role="group"><button type="button" class="btn btn-outline-info ver-items-venta-btn" data-idx="${idx}"><i class="fas fa-list me-2"></i>Ver</button><button type="button" class="btn btn-outline-primary edit-venta-btn" data-id="${v.id}"><i class="fas fa-pen me-2"></i>Editar</button></div><button type="button" class="btn btn-outline-secondary create-inst-from-sale-btn" data-idx="${idx}"><i class="fas fa-tools me-2"></i>Inst</button></div></td></tr>`;
    }).join("");

    const total = ventasVista.reduce((s, v) => s + Number(v.total || 0), 0);
    const contado = ventasVista.reduce((s, v) => s + (Number(v.abono || 0) >= Number(v.total || 0) ? Number(v.total || 0) : 0), 0);
    const credito = ventasVista.reduce((s, v) => s + Math.max(Number(v.total || 0) - Number(v.abono || 0), 0), 0);
    const ym = today().slice(0, 7);
    const totalMes = ventasVista.reduce((s, v) => s + (String(v.fecha || "").slice(0, 7) === ym ? Number(v.total || 0) : 0), 0);
    if (q("#ventas")) q("#ventas").textContent = fmtInt(ventasVista.length);
    if (q("#total")) q("#total").textContent = money(total);
    if (q("#totalContado")) q("#totalContado").textContent = money(contado);
    if (q("#totalCredito")) q("#totalCredito").textContent = money(credito);
    animateCounter(q("#ventasKpiTotalVendido"), total);
    animateCounter(q("#ventasKpiContado"), contado);
    animateCounter(q("#ventasKpiCobrar"), credito);
    animateCounter(q("#ventasKpiMes"), totalMes);
    ensureTablePagination(q("#datatablesSimple"), "ventas", 10);
  }

  async function modInst() {
    await load("instalacion");
    const form = q("#dataForm"), body = q("#datatablesSimple tbody");
    if (!form || !body) return;
    const estadoMap = { "1": "Pendiente", "2": "Listo para Instalacion", "3": "En Instalacion", "4": "Completado" };
    const estadoToValue = { Pendiente: "1", "Listo para Instalacion": "2", "Listo para Instalación": "2", "En Instalacion": "3", "En Instalación": "3", Completado: "4" };
    const modalEl = q("#editarInstalacionModal");
    const editForm = q("#editInstalacionForm");
    const modal = modalEl && window.bootstrap ? window.bootstrap.Modal.getOrCreateInstance(modalEl) : null;
    const prefKey = "ventaParaInstalacion";
    const notice = q("#instFromVentaNotice");
    const setReq = (selector, on) => { const el = q(selector); if (el) el.required = !!on; };
    const applyRequiredMode = (fromVenta) => {
      setReq("#cliente", !fromVenta);
      setReq("#telefono", !fromVenta);
      setReq("#producto", !fromVenta);
      setReq("#ubicacion", !fromVenta);
      setReq("#fechaEntrega", fromVenta);
      setReq("#instalador", fromVenta);
      setReq("#observaciones", fromVenta);
    };
    const aplicarPrefillDesdeVenta = () => {
      const raw = localStorage.getItem(prefKey);
      if (!raw) {
        applyRequiredMode(false);
        if (notice) notice.classList.add("d-none");
        return;
      }
      try {
        applyRequiredMode(true);
        const data = JSON.parse(raw);
        if (q("#cliente")) q("#cliente").value = data.cliente || "";
        if (q("#telefono")) q("#telefono").value = data.telefono || "";
        if (q("#producto")) q("#producto").value = data.producto || "";
        if (q("#ubicacion")) q("#ubicacion").value = data.ubicacion || "";
        const obs = q("#observaciones");
        const descLine = data.descripcion ? `Referencia: ${data.descripcion}` : "";
        const pedidoLine = data.numero_pedido ? `Pedido: ${data.numero_pedido}` : "";
        const extra = [descLine, pedidoLine].filter(Boolean).join(" | ");
        if (obs && extra) obs.value = extra;
        if (notice) notice.classList.remove("d-none");
      } catch (_) {
        localStorage.removeItem(prefKey);
        applyRequiredMode(false);
        if (notice) notice.classList.add("d-none");
      }
    };
    aplicarPrefillDesdeVenta();
      form.onsubmit = async (e) => {
        e.preventDefault();
        try {
          const avisoCliente = !!q("#avisoCliente")?.checked;
          const avisoInstalador = !!q("#avisoInstalador")?.checked;
          const payload = {
            instalador: q("#instalador").value || "Sin asignar",
            cliente: q("#cliente").value,
            telefono: q("#telefono").value,
            producto: q("#producto").value,
          cantidad: Number(q("#cantidad").value || 0),
          ubicacion: q("#ubicacion").value,
          fecha_entrega: q("#fechaEntrega").value,
            estado: estadoMap[q("#estado").value] || "Pendiente",
            observaciones: q("#observaciones").value
          };
          const guardar = async () => {
            await ins("instalacion", payload);
            localStorage.removeItem(prefKey);
            form.reset();
            applyRequiredMode(false);
            if (notice) notice.classList.add("d-none");
            renderInst();
            if (window.Swal) {
              window.Swal.fire({ icon: "success", title: "Instalación registrada correctamente", timer: 1700, showConfirmButton: false });
            } else {
              alertx("Instalación registrada correctamente", "success");
            }
          };

          const msgCliente = mensajeCliente(payload.cliente, payload.fecha_entrega, payload.ubicacion, payload.producto);
          const msgInst = mensajeInstalador(payload.cliente, payload.telefono, payload.ubicacion, payload.producto, payload.fecha_entrega);

          if (!avisoCliente && !avisoInstalador) {
            await guardar();
            return;
          }

          if (window.Swal) {
            let enviadoCliente = !avisoCliente;
            let enviadoInst = !avisoInstalador;
            const html = `
              <div class="text-start">
                <p class="mb-2">Primero envía los WhatsApp y luego guarda la instalación.</p>
                <div class="d-grid gap-2">
                  ${avisoCliente ? '<button type="button" class="btn btn-outline-success" id="btnWaCliente">Abrir WhatsApp cliente</button>' : ""}
                  ${avisoInstalador ? '<button type="button" class="btn btn-outline-primary" id="btnWaInst">Abrir WhatsApp instalador</button>' : ""}
                </div>
              </div>
            `;
            await window.Swal.fire({
              title: "Enviar WhatsApp",
              html,
              showCancelButton: true,
              confirmButtonText: "Guardar instalación",
              cancelButtonText: "Cancelar",
              didOpen: () => {
                const b1 = document.getElementById("btnWaCliente");
                if (b1) b1.addEventListener("click", () => {
                  abrirWhatsApp(payload.telefono, msgCliente);
                  enviadoCliente = true;
                  b1.disabled = true;
                });
                const b2 = document.getElementById("btnWaInst");
                if (b2) b2.addEventListener("click", () => {
                  abrirWhatsApp(numeroInstalador, msgInst);
                  enviadoInst = true;
                  b2.disabled = true;
                });
                const confirmBtn = window.Swal.getConfirmButton();
                if (confirmBtn) confirmBtn.disabled = !(enviadoCliente && enviadoInst);
                const check = setInterval(() => {
                  const ok = enviadoCliente && enviadoInst;
                  if (confirmBtn) confirmBtn.disabled = !ok;
                  if (ok) clearInterval(check);
                }, 200);
              },
              preConfirm: () => {
                if (!enviadoCliente || !enviadoInst) {
                  window.Swal.showValidationMessage("Debes abrir ambos WhatsApp antes de guardar.");
                  return false;
                }
                return true;
              }
            }).then(async (res) => {
              if (res.isConfirmed) await guardar();
            });
          } else {
            if (avisoCliente) {
              const ok = window.confirm("Abrir WhatsApp del cliente ahora?");
              if (ok) abrirWhatsApp(payload.telefono, msgCliente);
            }
            if (avisoInstalador) {
              const ok = window.confirm("Abrir WhatsApp del instalador ahora?");
              if (ok) abrirWhatsApp(numeroInstalador, msgInst);
            }
            await guardar();
          }
        } catch (err) { alertx(err.message || "No se pudo guardar instalacion", "error"); }
      };
    if (editForm && !editForm.dataset.bound) {
      editForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = q("#editInstId")?.value;
        if (!id) return;
        try {
          await upd("instalacion", id, {
            instalador: q("#editInstalador").value || "Sin asignar",
            telefono: q("#editTelefono").value,
            cantidad: Number(q("#editCantidad").value || 0),
            ubicacion: q("#editUbicacion").value,
            fecha_entrega: q("#editFechaEntrega").value,
            estado: estadoMap[q("#editEstado").value] || "Pendiente",
            observaciones: q("#editObservaciones").value
          });
          renderInst();
          if (modal) modal.hide();
          alertx("Instalacion actualizada", "success");
        } catch (err) {
          alertx(err.message || "No se pudo actualizar instalacion", "error");
        }
      };
      editForm.dataset.bound = "1";
    }

    if (!instEditClickBound) {
      document.addEventListener("click", (e) => {
        const btn = e.target.closest(".edit-inst-btn");
        if (!btn) return;
        const item = st.instalacion.find((x) => String(x.id) === String(btn.dataset.id));
        if (!item) return;
        if (q("#editInstId")) q("#editInstId").value = item.id;
        if (q("#editInstalador")) q("#editInstalador").value = val(item, "instalador") || "";
        if (q("#editTelefono")) q("#editTelefono").value = val(item, "telefono") || "";
        if (q("#editCantidad")) q("#editCantidad").value = Number(val(item, "cantidad") || 0);
        if (q("#editUbicacion")) q("#editUbicacion").value = val(item, "ubicacion") || "";
        if (q("#editFechaEntrega")) q("#editFechaEntrega").value = val(item, "fecha_entrega", "fechaEntrega") || "";
        if (q("#editEstado")) q("#editEstado").value = estadoToValue[val(item, "estado")] || "1";
        if (q("#editObservaciones")) q("#editObservaciones").value = val(item, "observaciones") || "";
        const currentModalEl = q("#editarInstalacionModal");
        const currentModal = currentModalEl && window.bootstrap ? window.bootstrap.Modal.getOrCreateInstance(currentModalEl) : null;
        if (currentModal) currentModal.show();
      }, { passive: true });
      instEditClickBound = true;
    }

    renderInst(); buscador("buscadorInstalacion", "datatablesSimple"); mountTableTools("instalacion");
  }
  function renderInst() {
    const body = q("#datatablesSimple tbody"); if (!body) return;
    body.innerHTML = st.instalacion.map((i) => {
      const estado = val(i, "estado") || "Pendiente";
      const checked = estado !== "Pendiente";
      return `<tr class="${checked ? "table-success" : ""}"><td><input type="checkbox" class="estado-check" data-id="${i.id}" ${checked ? "checked" : ""}></td><td>${val(i, "instalador") || "-"}</td><td>${val(i, "cliente") || "-"}</td><td>${val(i, "telefono") || "-"}</td><td>${val(i, "producto") || "-"}</td><td>${fmtInt(val(i, "cantidad"))}</td><td>${val(i, "ubicacion") || "-"}</td><td>${val(i, "fecha_entrega", "fechaEntrega") || "-"}</td><td>${val(i, "observaciones") || "-"}</td><td><button type="button" class="btn btn-sm btn-outline-primary edit-inst-btn" data-id="${i.id}"><i class="fas fa-pen me-1"></i>Editar</button></td></tr>`;
    }).join("");
    if (q("#pedidoEntregar")) q("#pedidoEntregar").textContent = fmtInt(st.instalacion.length);
    const hoy = today();
    const instHoy = st.instalacion.filter((i) => asDay(val(i, "fecha_entrega", "fechaEntrega")) === hoy).length;
    const instPend = st.instalacion.filter((i) => {
      const f = asDay(val(i, "fecha_entrega", "fechaEntrega"));
      return !!f && f > hoy;
    }).length;
    animateCounter(q("#instKpiProgramadas"), st.instalacion.length);
    animateCounter(q("#instKpiHoy"), instHoy);
    animateCounter(q("#instKpiPendientes"), instPend);
    ensureTablePagination(q("#datatablesSimple"), "instalacion", 10);
    document.querySelectorAll(".estado-check").forEach((c) => c.onchange = async function () {
      try { await upd("instalacion", this.dataset.id, { estado: this.checked ? "Completado" : "Pendiente" }); renderInst(); }
      catch (err) { this.checked = !this.checked; alertx(err.message || "No se pudo cambiar estado", "error"); }
    });
  }

  async function modGastos() {
    await load("gastos");
    const form = q("#dataForm"), body = q("#datatablesSimple tbody");
    if (!form || !body) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await ins("gastos", { tipo: q("#tipo").value, monto: Number(q("#monto").value || 0), fecha_hora: q("#fechaHora").value, descripcion: q("#descripcion").value });
        form.reset(); renderGastos(); alertx("Movimiento registrado", "success");
      } catch (err) { alertx(err.message || "No se pudo guardar movimiento", "error"); }
    };
    renderGastos(); buscador("buscadorGastos", "datatablesSimple"); mountTableTools("gastos");
  }
  function renderGastos() {
    const body = q("#datatablesSimple tbody"); if (!body) return;
    body.innerHTML = st.gastos.map((g) => `<tr><td>${tipoGasto(val(g, "tipo"))}</td><td>${money(val(g, "monto"))}</td><td>${val(g, "fecha_hora", "fechaHora") || "-"}</td><td>${val(g, "descripcion") || "-"}</td></tr>`).join("");
    let tg = 0, tc = 0, ti = 0; st.gastos.forEach((g) => { const m = Number(val(g, "monto") || 0); if (String(val(g, "tipo")) === "1") tg += m; else if (String(val(g, "tipo")) === "2") tc += m; else if (String(val(g, "tipo")) === "3") ti += m; });
    const ym = today().slice(0, 7);
    const gastosMes = st.gastos.reduce((s, g) => {
      const fecha = String(val(g, "fecha_hora", "fechaHora") || "");
      return s + (String(val(g, "tipo")) === "1" && fecha.slice(0, 7) === ym ? Number(val(g, "monto") || 0) : 0);
    }, 0);
    const categorias = new Set(st.gastos.map((g) => String(val(g, "tipo") || "").trim()).filter(Boolean)).size;
    if (q("#totalGastos")) q("#totalGastos").textContent = money(tg);
    if (q("#totalCapitalInicial")) q("#totalCapitalInicial").textContent = money(tc);
    if (q("#totalAnadir")) q("#totalAnadir").textContent = money(ti);
    if (q("#balanceTotal")) q("#balanceTotal").textContent = money(tc + ti - tg);
    if (q("#gastosTotal")) q("#gastosTotal").textContent = fmtInt(st.gastos.length);
    animateCounter(q("#gastosKpiTotal"), tg);
    animateCounter(q("#gastosKpiMes"), gastosMes);
    animateCounter(q("#gastosKpiCategorias"), categorias);
    ensureTablePagination(q("#datatablesSimple"), "gastos", 10);
  }

  async function modMercancia() {
    await load("mercancia");
    const form = q("#dataForm"), body = q("#datatablesSimple tbody");
    if (!form || !body) return;
    const editForm = q("#editMercanciaForm");
    const modalEl = q("#editarMercanciaModal");
    const modal = modalEl && window.bootstrap ? window.bootstrap.Modal.getOrCreateInstance(modalEl) : null;
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await ins("mercancia", {
          fecha_recepcion: q("#fechaRecepcion").value, transportadora: q("#transportadora").value, remitente: q("#remitente").value,
          cliente_destino: q("#clienteDestino").value, cantidad_cajas: Number(q("#cantidad").value || 0),
          precio: Number(q("#precio").value || 0), descripcion: normalizeMercanciaDesc(q("#producto").value, q("#descripcion").value), observaciones: q("#observaciones").value
        });
        form.reset(); renderMercancia(); alertx("Mercancia registrada", "success");
      } catch (err) { alertx(err.message || "No se pudo guardar mercancia", "error"); }
    };
    if (editForm && !editForm.dataset.bound) {
      editForm.onsubmit = async (e) => {
        e.preventDefault();
        const id = q("#editMercanciaId")?.value;
        if (!id) return;
        try {
          await upd("mercancia", id, {
            fecha_recepcion: q("#editFechaRecepcion").value,
            transportadora: q("#editTransportadora").value,
            remitente: q("#editRemitente").value,
            cliente_destino: q("#editClienteDestino").value,
            cantidad_cajas: Number(q("#editCantidadCajas").value || 0),
            precio: Number(q("#editValorTransporte").value || 0),
            descripcion: normalizeMercanciaDesc(q("#editProductoMercancia").value, q("#editDescripcionMercancia").value),
            observaciones: q("#editObservacionesMercancia").value
          });
          renderMercancia();
          if (modal) modal.hide();
          alertx("Mercancia actualizada", "success");
        } catch (err) {
          alertx(err.message || "No se pudo actualizar mercancia", "error");
        }
      };
      editForm.dataset.bound = "1";
    }
    if (!mercanciaEditClickBound) {
      document.addEventListener("click", (e) => {
        const btn = e.target.closest(".edit-mercancia-btn");
        if (!btn) return;
        const item = st.mercancia.find((x) => String(x.id) === String(btn.dataset.id));
        if (!item) return;
        const desc = splitMercanciaDesc(val(item, "descripcion"));
        if (q("#editMercanciaId")) q("#editMercanciaId").value = item.id;
        if (q("#editFechaRecepcion")) q("#editFechaRecepcion").value = val(item, "fecha_recepcion", "fechaRecepcion") || "";
        if (q("#editTransportadora")) q("#editTransportadora").value = val(item, "transportadora") || "";
        if (q("#editRemitente")) q("#editRemitente").value = val(item, "remitente") || "";
        if (q("#editClienteDestino")) q("#editClienteDestino").value = val(item, "cliente_destino", "clienteDestino") || "";
        if (q("#editProductoMercancia")) q("#editProductoMercancia").value = desc.producto === "-" ? "" : desc.producto;
        if (q("#editCantidadCajas")) q("#editCantidadCajas").value = Number(val(item, "cantidad_cajas", "cantidad") || 0);
        if (q("#editValorTransporte")) q("#editValorTransporte").value = Number(val(item, "precio") || 0);
        if (q("#editDescripcionMercancia")) q("#editDescripcionMercancia").value = desc.descripcion === "-" ? "" : desc.descripcion;
        if (q("#editObservacionesMercancia")) q("#editObservacionesMercancia").value = val(item, "observaciones") || "";
        const currentModalEl = q("#editarMercanciaModal");
        const currentModal = currentModalEl && window.bootstrap ? window.bootstrap.Modal.getOrCreateInstance(currentModalEl) : null;
        if (currentModal) currentModal.show();
      }, { passive: true });
      mercanciaEditClickBound = true;
    }
    renderMercancia(); buscador("buscadorMercancia", "datatablesSimple"); mountTableTools("mercancia");
  }
  function renderMercancia() {
    const body = q("#datatablesSimple tbody"); if (!body) return;
    body.innerHTML = st.mercancia.map((m) => {
      const desc = splitMercanciaDesc(val(m, "descripcion"));
      return `<tr><td>${val(m, "fecha_recepcion", "fechaRecepcion") || "-"}</td><td>${val(m, "transportadora") || "-"}</td><td>${val(m, "remitente") || "-"}</td><td>${val(m, "cliente_destino", "clienteDestino") || "-"}</td><td>${desc.producto}</td><td>${fmtInt(val(m, "cantidad_cajas", "cantidad"))}</td><td>${money(val(m, "precio"))}</td><td>${desc.descripcion}</td><td>${val(m, "observaciones") || "-"}</td><td><button type="button" class="btn btn-sm btn-outline-primary edit-mercancia-btn" data-id="${m.id}"><i class="fas fa-pen me-1"></i>Editar</button></td></tr>`;
    }).join("");
    if (q("#mercancia")) q("#mercancia").textContent = fmtInt(st.mercancia.length);
    const valorTotal = st.mercancia.reduce((s, m) => s + (Number(val(m, "precio") || 0) * Number(val(m, "cantidad_cajas", "cantidad") || 0)), 0);
    const proveedores = new Set(st.mercancia.map((m) => String(val(m, "transportadora") || "").trim()).filter(Boolean)).size;
    animateCounter(q("#mercKpiRecibidos"), st.mercancia.length);
    animateCounter(q("#mercKpiValor"), valorTotal);
    animateCounter(q("#mercKpiProveedores"), proveedores);
    ensureTablePagination(q("#datatablesSimple"), "mercancia", 10);
  }

  async function modCartera() {
    await load("ventas");
    const tb = q("#carteraTabla"), msg = q("#mensajeVacio");
    const buscador = q("#buscadorCartera"), filtroSaldo = q("#filtroSaldo"), filtroModo = q("#filtroModoCartera"), btnExportar = q("#btnExportarCartera");
    if (!tb) return;

    const grouped = new Map();
    st.ventas.forEach((v, idx) => {
      const numeroPedido = String(val(v, "numero_pedido", "numeroPedido") || "").trim();
      const numeroRecibo = String(val(v, "numero_recibo", "numeroRecibo") || "").trim();
      const clienteKey = String(val(v, "cliente") || "").trim().toLowerCase();
      const key = numeroPedido
        ? `pedido:${numeroPedido}|cliente:${clienteKey}`
        : (numeroRecibo ? `recibo:${numeroRecibo}|cliente:${clienteKey}` : `item:${val(v, "id") || idx}`);
      const total = Number(val(v, "cantidad") || 0) * Number(val(v, "precio") || 0);
      const abono = Number(val(v, "abono") || 0);
      const producto = String(val(v, "producto") || "").trim();
      const descripcion = String(val(v, "descripcion", "referencia") || "").trim();
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: val(v, "id"),
          itemIds: [],
          cliente: val(v, "cliente") || "-",
          telefono: val(v, "telefono") || "-",
          productos: [],
          descripciones: [],
          fecha: val(v, "fecha") || "-",
          numeroPedido: numeroPedido || "-",
          numeroCartera: val(v, "numero_cartera", "numeroCartera") || "-",
          total: 0,
          ab: 0
        });
      }
      const g = grouped.get(key);
      g.itemIds.push(val(v, "id"));
      g.total += total;
      g.ab = Math.max(Number(g.ab || 0), abono);
      if (producto && !g.productos.includes(producto)) g.productos.push(producto);
      if (descripcion && !g.descripciones.includes(descripcion)) g.descripciones.push(descripcion);
      if (!g.numeroCartera || g.numeroCartera === "-") g.numeroCartera = val(v, "numero_cartera", "numeroCartera") || "-";
    });
    const base = Array.from(grouped.values()).map((g) => ({ ...g, saldo: g.total - g.ab }));

    const applyFilters = () => {
      const term = String(buscador?.value || "").toLowerCase().trim();
      const saldoRule = String(filtroSaldo?.value || "todos");
      const modo = String(filtroModo?.value || "pendientes");
      return base.filter((c) => {
        const productoTxt = c.productos.length > 1 ? `${c.productos[0]} (+${c.productos.length - 1})` : (c.productos[0] || "-");
        const descripcionTxt = c.descripciones.length > 1 ? `${c.descripciones[0]} (+${c.descripciones.length - 1})` : (c.descripciones[0] || "-");
        const hayTexto = !term || [c.cliente, c.telefono, productoTxt, descripcionTxt, c.numeroPedido, c.numeroCartera]
          .join(" ").toLowerCase().includes(term);
        const cumpleModo = modo === "abonos" ? c.ab > 0 : c.saldo > 0;
        let haySaldo = true;
        if (saldoRule === "mayor-1000") haySaldo = c.saldo > 1000;
        else if (saldoRule === "mayor-500") haySaldo = c.saldo > 500;
        else if (saldoRule === "menor-500") haySaldo = c.saldo <= 500;
        return hayTexto && haySaldo && cumpleModo;
      });
    };

    const renderFiltered = () => {
      const cart = applyFilters();
      const modo = String(filtroModo?.value || "pendientes");
      const soloVisual = modo === "abonos";
      if (!cart.length) {
        tb.innerHTML = "";
        if (msg) msg.style.display = "";
        animateCounter(q("#totalCartera"), 0);
        animateCounter(q("#clientesActivos"), 0);
        animateCounter(q("#promedioCliente"), 0);
        if (q("#totalRegistros")) q("#totalRegistros").textContent = "0 registros";
        ensureTablePagination(q("#carteraTabla")?.closest("table"), "cartera", 10);
        return;
      }

      if (msg) msg.style.display = "none";
      tb.innerHTML = cart.map((c, i) => {
        const productoTxt = c.productos.length > 1 ? `${c.productos[0]} (+${c.productos.length - 1})` : (c.productos[0] || "-");
        const descripcionTxt = c.descripciones.length > 1 ? `${c.descripciones[0]} (+${c.descripciones.length - 1})` : (c.descripciones[0] || "-");
        const acciones = soloVisual
          ? '<span class="text-muted small">Solo visual</span>'
          : `<div class="d-flex flex-column flex-md-row gap-2"><input type="number" class="abono-input form-control form-control-sm" min="0.01" step="0.01" data-i="${i}" placeholder="Valor"><input type="text" class="abono-cartera-input form-control form-control-sm" data-i="${i}" placeholder="No. cartera"><button class="btn btn-success btn-sm abonar-btn" data-id="${c.id}" data-i="${i}">Abonar</button></div>`;
        return `<tr><td>${c.cliente}</td><td>${c.telefono}</td><td>${productoTxt}</td><td>${descripcionTxt}</td><td>${c.fecha}</td><td>${c.numeroPedido}</td><td>${c.numeroCartera || "-"}</td><td>${money(c.total)}</td><td>${money(c.ab)}</td><td>${money(c.saldo)}</td><td>${acciones}</td></tr>`;
      }).join("");
      const total = cart.reduce((s, c) => s + c.saldo, 0);
      const clientes = new Set(cart.map((c) => val(c, "cliente") || "")).size;
      animateCounter(q("#totalCartera"), total);
      animateCounter(q("#clientesActivos"), clientes);
      animateCounter(q("#promedioCliente"), clientes ? total / clientes : 0);
      if (q("#totalRegistros")) q("#totalRegistros").textContent = `${fmtInt(cart.length)} registros`;
      ensureTablePagination(q("#carteraTabla")?.closest("table"), "cartera", 10);
      if (soloVisual) return;

      document.querySelectorAll(".abonar-btn").forEach((b) => b.onclick = async function () {
        const i = Number(this.dataset.i);
        const inp = document.querySelector(`input.abono-input[data-i="${i}"]`);
        const carteraInp = document.querySelector(`input.abono-cartera-input[data-i="${i}"]`);
        const abono = Number(inp?.value || 0);
        const numeroCartera = txt(carteraInp?.value);
        if (!abono || abono <= 0) return alertx("Ingresa un abono valido", "warning");
        if (abono > cart[i].saldo) return alertx("El abono supera el saldo", "warning");
        if (!numeroCartera) return alertx("Ingresa numero de cartera para el abono", "warning");
        try {
          const nuevoAbono = cart[i].ab + abono;
          const ids = (cart[i].itemIds || []).filter(Boolean);
          if (!ids.length) throw new Error("No se encontraron items del pedido");
          const { error } = await sb.from(t.ventas).update({ abono: nuevoAbono, numero_cartera: numeroCartera }).in("id", ids);
          if (error) throw error;
          logHistory("ventas", "abono", { ids, abono, abono_total_pedido: nuevoAbono, numero_cartera: numeroCartera });
          await load("ventas");
          alertx("Abono registrado", "success");
          await modCartera();
        } catch (err) {
          alertx(err.message || "No se pudo registrar abono", "error");
        }
      });
    };

    if (buscador && !buscador.dataset.bound) {
      buscador.addEventListener("input", renderFiltered);
      buscador.dataset.bound = "1";
    }
    if (filtroSaldo && !filtroSaldo.dataset.bound) {
      filtroSaldo.addEventListener("change", renderFiltered);
      filtroSaldo.dataset.bound = "1";
    }
    if (filtroModo && !filtroModo.dataset.bound) {
      filtroModo.addEventListener("change", renderFiltered);
      filtroModo.dataset.bound = "1";
    }
    if (btnExportar && !btnExportar.dataset.bound) {
      btnExportar.addEventListener("click", () => {
        const cart = applyFilters();
        if (!cart.length) return alertx("No hay datos para exportar", "warning");
        const rows = [["Cliente", "Telefono", "Producto", "Descripcion", "Fecha", "Numero Pedido Venta", "Numero Cartera", "Total", "Abono", "Saldo"]];
        cart.forEach((c) => {
          const productoTxt = c.productos.length > 1 ? `${c.productos[0]} (+${c.productos.length - 1})` : (c.productos[0] || "-");
          const descripcionTxt = c.descripciones.length > 1 ? `${c.descripciones[0]} (+${c.descripciones.length - 1})` : (c.descripciones[0] || "-");
          rows.push([
          c.cliente || "",
          c.telefono || "",
          productoTxt,
          descripcionTxt,
          c.fecha || "",
          c.numeroPedido || "",
          c.numeroCartera || "",
          String(c.total),
          String(c.ab),
          String(c.saldo)
          ]);
        });
        const csv = rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `cartera_${today()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });
      btnExportar.dataset.bound = "1";
    }

    const btnResumen = q("#btnResumenCartera");
    if (btnResumen && !btnResumen.dataset.bound) {
      btnResumen.addEventListener("click", () => {
        const cart = applyFilters();
        if (!cart.length) return alertx("No hay datos para resumir", "warning");
        const total = cart.reduce((s, c) => s + c.saldo, 0);
        const clientes = new Set(cart.map((c) => val(c, "cliente") || "")).size;
        const promedio = clientes ? total / clientes : 0;
        const html = `
          <div class="table-responsive">
            <table class="table table-sm table-bordered mb-3">
              <thead class="table-light">
                <tr><th>Concepto</th><th>Valor</th></tr>
              </thead>
              <tbody>
                <tr><td>Total por Cobrar</td><td>${money(total)}</td></tr>
                <tr><td>Clientes con Deuda</td><td>${fmtInt(clientes)}</td></tr>
                <tr><td>Deuda Promedio por Cliente</td><td>${money(promedio)}</td></tr>
              </tbody>
            </table>
            <div class="row g-2">
              <div class="col-md-6">
                <div class="card bg-light">
                  <div class="card-body">
                    <h6 class="card-title">Distribucion por Saldo</h6>
                    <ul class="list-unstyled mb-0">
                      <li>Mayor a $1,000: ${fmtInt(cart.filter(c => c.saldo > 1000).length)}</li>
                      <li>Mayor a $500: ${fmtInt(cart.filter(c => c.saldo > 500).length)}</li>
                      <li>Menor a $500: ${fmtInt(cart.filter(c => c.saldo <= 500).length)}</li>
                    </ul>
                  </div>
                </div>
              </div>
              <div class="col-md-6">
                <div class="card bg-light">
                  <div class="card-body">
                    <h6 class="card-title">Distribucion por Abono</h6>
                    <ul class="list-unstyled mb-0">
                      <li>Con Abono: ${fmtInt(cart.filter(c => c.ab > 0).length)}</li>
                      <li>Sin Abono: ${fmtInt(cart.filter(c => c.ab === 0).length)}</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
        if (window.Swal) {
          window.Swal.fire({
            title: "Resumen de Cartera",
            html,
            width: 800,
            confirmButtonText: "Cerrar"
          });
        } else {
          alertx("No se pudo abrir resumen (SweetAlert no disponible)", "warning");
        }
      });
      btnResumen.dataset.bound = "1";
    }

    renderFiltered();
    mountTableTools("cartera");
  }

  async function modDashboard() {
    const sumVenta = (v) => {
      const totalCampo = Number(val(v, "total"));
      if (Number.isFinite(totalCampo) && totalCampo > 0) return totalCampo;
      return Number(val(v, "cantidad") || 0) * Number(val(v, "precio") || 0);
    };
    const agruparVentas = (rows) => {
      const map = new Map();
      rows.forEach((v, idx) => {
        const numeroPedido = String(val(v, "numero_pedido", "numeroPedido") || "").trim();
        const numeroRecibo = String(val(v, "numero_recibo", "numeroRecibo") || "").trim();
        const clienteKey = String(val(v, "cliente") || "").trim().toLowerCase();
        const key = numeroPedido
          ? `pedido:${numeroPedido}|cliente:${clienteKey}`
          : (numeroRecibo ? `recibo:${numeroRecibo}|cliente:${clienteKey}` : `item:${val(v, "id") || idx}`);
        const total = sumVenta(v);
        const abono = Number(val(v, "abono") || 0);
        const cantidad = Number(val(v, "cantidad") || 0);
        const producto = String(val(v, "producto") || "").trim();

        if (!map.has(key)) {
          map.set(key, {
            fecha: val(v, "fecha") || "-",
            cliente: val(v, "cliente") || "-",
            vendedor: val(v, "vendedor") || "Sin vendedor",
            productos: [],
            cantidad: 0,
            total: 0,
            abono: 0
          });
        }
        const g = map.get(key);
        g.total += total;
        g.cantidad += cantidad;
        g.abono = Math.max(Number(g.abono || 0), abono);
        if (producto && !g.productos.includes(producto)) g.productos.push(producto);
      });
      return Array.from(map.values()).map((x) => ({ ...x, saldo: Math.max(Number(x.total || 0) - Number(x.abono || 0), 0) }));
    };
    const inRange = (fecha, from, to) => {
      const d = asDay(fecha);
      if (!d || d === "-") return false;
      return (!from || d >= from) && (!to || d <= to);
    };
    const rangeByFiltro = () => {
      const periodo = String(q("#dashFiltroPeriodo")?.value || "mes");
      const hoy = today();
      const year = hoy.slice(0, 4);
      const month = hoy.slice(0, 7);
      if (periodo === "hoy") return { from: hoy, to: hoy, label: "Hoy" };
      if (periodo === "mes") return { from: `${month}-01`, to: hoy, label: "Este mes" };
      if (periodo === "anio") return { from: `${year}-01-01`, to: hoy, label: "Este año" };
      const from = q("#dashFechaDesde")?.value || "";
      const to = q("#dashFechaHasta")?.value || "";
      return { from, to, label: from && to ? `Personalizado (${from} a ${to})` : "Personalizado" };
    };
    const toggleCustomRange = () => {
      const show = String(q("#dashFiltroPeriodo")?.value || "") === "custom";
      document.querySelectorAll(".dash-custom-range").forEach((el) => el.classList.toggle("d-none", !show));
    };

    let ventas = [];
    let instalaciones = [];
    try {
      const [resVentas, resInst] = await Promise.all([
        sb.from(t.ventas).select("id,fecha,numero_recibo,numero_pedido,producto,cantidad,precio,total,abono,vendedor,cliente").order("fecha", { ascending: false }),
        sb.from(t.instalacion).select("id,estado,fecha_entrega")
      ]);
      if (resVentas.error) throw resVentas.error;
      if (resInst.error) throw resInst.error;
      ventas = resVentas.data || [];
      instalaciones = resInst.data || [];
    } catch (err) {
      alertx(err.message || "No se pudo cargar dashboard", "error");
      return;
    }

    const ventasAgrupadasAll = agruparVentas(ventas);
    const hoy = today();
    const mesActual = hoy.slice(0, 7);

    const ventasHoy = ventasAgrupadasAll.filter((v) => asDay(v.fecha) === hoy).reduce((s, v) => s + Number(v.total || 0), 0);
    const ventasMes = ventasAgrupadasAll.filter((v) => String(v.fecha || "").slice(0, 7) === mesActual).reduce((s, v) => s + Number(v.total || 0), 0);

    const renderDashboard = () => {
      const range = rangeByFiltro();
      if (range.from && range.to && range.from > range.to) {
        alertx("El rango personalizado es invalido", "warning");
        return;
      }
      if (q("#dashFiltroActualLabel")) q("#dashFiltroActualLabel").textContent = range.label;

      const ventasFiltradas = ventas.filter((v) => inRange(val(v, "fecha"), range.from, range.to));
      const ventasAgrupadas = agruparVentas(ventasFiltradas);
      const carteraPendiente = ventasAgrupadas.reduce((s, v) => s + Number(v.saldo || 0), 0);
      const pedidosInstalar = instalaciones.filter((i) => {
        const estado = String(val(i, "estado") || "").toLowerCase();
        const noCompletado = !estado.includes("completado");
        const fecha = val(i, "fecha_entrega", "fechaEntrega");
        return noCompletado && inRange(fecha, range.from, range.to);
      }).length;

      if (q("#dashVentasHoy")) q("#dashVentasHoy").textContent = money(ventasHoy);
      if (q("#dashVentasMes")) q("#dashVentasMes").textContent = money(ventasMes);
      if (q("#dashCarteraPendiente")) q("#dashCarteraPendiente").textContent = money(carteraPendiente);
      if (q("#dashPedidosInstalar")) q("#dashPedidosInstalar").textContent = fmtInt(pedidosInstalar);

      const ventasUlt30 = {};
      const endDate = range.to || hoy;
      const end = new Date(`${endDate}T00:00:00`);
      for (let i = 29; i >= 0; i -= 1) {
        const d = new Date(end);
        d.setDate(end.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        ventasUlt30[key] = 0;
      }
      ventasAgrupadas.forEach((v) => {
        const f = asDay(v.fecha);
        if (Object.prototype.hasOwnProperty.call(ventasUlt30, f)) ventasUlt30[f] += Number(v.total || 0);
      });

      const porVendedor = {};
      ventasAgrupadas.forEach((v) => {
        const vend = String(v.vendedor || "Sin vendedor").trim() || "Sin vendedor";
        porVendedor[vend] = (porVendedor[vend] || 0) + Number(v.total || 0);
      });
      const vendedores = Object.entries(porVendedor).sort((a, b) => b[1] - a[1]).slice(0, 8);

      const prodTop = {};
      ventasFiltradas.forEach((v) => {
        const p = canonProducto(val(v, "producto"));
        prodTop[p] = (prodTop[p] || 0) + Number(val(v, "cantidad") || 0);
      });
      const topProductos = Object.entries(prodTop).sort((a, b) => b[1] - a[1]).slice(0, 8);

      if (charts.ventas30Dias) charts.ventas30Dias.destroy();
      if (charts.ventasVendedor) charts.ventasVendedor.destroy();
      if (charts.productosTop) charts.productosTop.destroy();

      if (window.Chart && q("#chartVentas30Dias")) {
        charts.ventas30Dias = new window.Chart(q("#chartVentas30Dias"), {
          type: "line",
          data: {
            labels: Object.keys(ventasUlt30),
            datasets: [{
              label: "Ventas",
              data: Object.values(ventasUlt30),
              borderColor: "#1d4ed8",
              backgroundColor: "rgba(29, 78, 216, 0.15)",
              fill: true,
              tension: 0.25
            }]
          },
          options: { responsive: true, plugins: { legend: { display: false } } }
        });
      }
      if (window.Chart && q("#chartVentasVendedor")) {
        charts.ventasVendedor = new window.Chart(q("#chartVentasVendedor"), {
          type: "bar",
          data: {
            labels: vendedores.map((x) => x[0]),
            datasets: [{ label: "Ventas", data: vendedores.map((x) => x[1]), backgroundColor: "#0f766e" }]
          },
          options: { responsive: true, plugins: { legend: { display: false } } }
        });
      }
      if (window.Chart && q("#chartProductosTop")) {
        charts.productosTop = new window.Chart(q("#chartProductosTop"), {
          type: "pie",
          data: {
            labels: topProductos.map((x) => x[0]),
            datasets: [{
              data: topProductos.map((x) => x[1]),
              backgroundColor: ["#2563eb", "#0d9488", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#65a30d", "#ea580c"]
            }]
          },
          options: { responsive: true, plugins: { legend: { position: "bottom" } } }
        });
      }

      const ultimas = [...ventasAgrupadas].sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || ""))).slice(0, 10);
      const body = q("#dashUltimasVentasBody");
      if (body) {
        body.innerHTML = ultimas.length
          ? ultimas.map((v) => {
            const productoTxt = v.productos.length > 1 ? `${v.productos[0]} (+${v.productos.length - 1})` : (v.productos[0] || "-");
            return `<tr><td>${v.fecha || "-"}</td><td>${v.cliente || "-"}</td><td>${productoTxt}</td><td>${fmtInt(v.cantidad)}</td><td>${money(v.total)}</td></tr>`;
          }).join("")
          : '<tr><td colspan="5" class="text-center text-muted">Sin ventas en el periodo</td></tr>';
      }
    };

    const filtroPeriodo = q("#dashFiltroPeriodo");
    const btnAplicar = q("#dashAplicarFiltro");
    if (filtroPeriodo) {
      filtroPeriodo.onchange = () => {
        toggleCustomRange();
        if (String(filtroPeriodo.value) !== "custom") renderDashboard();
      };
    }
    if (btnAplicar) btnAplicar.onclick = () => renderDashboard();

    toggleCustomRange();
    renderDashboard();
  }

  function showDay() {
    const h = today();
    if (vistActual.startsWith("ventas")) {
      const rows = st.ventas.filter((x) => asDay(val(x, "fecha")) === h).map((x) => `<tr><td>${val(x, "fecha") || "-"}</td><td>${val(x, "producto") || "-"}</td><td>${money(Number(val(x, "cantidad") || 0) * Number(val(x, "precio") || 0))}</td></tr>`).join("") || '<tr><td colspan="3" class="text-center">No hay ventas para hoy</td></tr>';
      if (q("#ventasDiaBody")) q("#ventasDiaBody").innerHTML = rows; if (q("#tablaVentas")) q("#tablaVentas").style.display = "none"; if (q("#ventasDia")) q("#ventasDia").style.display = "";
    }
    if (vistActual.startsWith("instalacion")) {
      const rows = st.instalacion.filter((x) => asDay(val(x, "fecha_entrega", "fechaEntrega")) === h).map((x) => `<tr><td>${val(x, "estado") || "-"}</td><td>${val(x, "instalador") || "-"}</td><td>${val(x, "cliente") || "-"}</td><td>${val(x, "telefono") || "-"}</td><td>${val(x, "producto") || "-"}</td><td>${fmtInt(val(x, "cantidad"))}</td><td>${val(x, "ubicacion") || "-"}</td><td>${val(x, "fecha_entrega", "fechaEntrega") || "-"}</td><td>${val(x, "observaciones") || "-"}</td></tr>`).join("") || '<tr><td colspan="9" class="text-center">No hay instalaciones para hoy</td></tr>';
      if (q("#instalacionDiaBody")) q("#instalacionDiaBody").innerHTML = rows; if (q("#tablaInstalacion")) q("#tablaInstalacion").style.display = "none"; if (q("#instalacionDia")) q("#instalacionDia").style.display = "";
    }
    if (vistActual.startsWith("gastos")) {
      const rows = st.gastos.filter((x) => asDay(val(x, "fecha_hora", "fechaHora")) === h).map((x) => `<tr><td>${tipoGasto(val(x, "tipo"))}</td><td>${money(val(x, "monto"))}</td><td>${val(x, "fecha_hora", "fechaHora") || "-"}</td><td>${val(x, "descripcion") || "-"}</td></tr>`).join("") || '<tr><td colspan="4" class="text-center">No hay gastos para hoy</td></tr>';
      if (q("#gastosDiaBody")) q("#gastosDiaBody").innerHTML = rows; if (q("#tablaGastos")) q("#tablaGastos").style.display = "none"; if (q("#gastosDia")) q("#gastosDia").style.display = "";
    }
    if (vistActual.startsWith("mercancia")) {
      const rows = st.mercancia.filter((x) => asDay(val(x, "fecha_recepcion", "fechaRecepcion")) === h).map((x) => {
        const desc = splitMercanciaDesc(val(x, "descripcion"));
        return `<tr><td>${val(x, "fecha_recepcion", "fechaRecepcion") || "-"}</td><td>${val(x, "transportadora") || "-"}</td><td>${val(x, "remitente") || "-"}</td><td>${val(x, "cliente_destino", "clienteDestino") || "-"}</td><td>${desc.producto}</td><td>${fmtInt(val(x, "cantidad_cajas", "cantidad"))}</td><td>${money(val(x, "precio"))}</td><td>${desc.descripcion}</td><td>${val(x, "observaciones") || "-"}</td></tr>`;
      }).join("") || '<tr><td colspan="9" class="text-center">No hay registros para hoy</td></tr>';
      if (q("#mercanciaDiaBody")) q("#mercanciaDiaBody").innerHTML = rows; if (q("#tablamercancia")) q("#tablamercancia").style.display = "none"; if (q("#mercanciaDia")) q("#mercanciaDia").style.display = "";
    }
  }
  function showAll() {
    ["#tablaVentas", "#tablamercancia", "#tablaInstalacion", "#tablaGastos"].forEach((id) => { const e = q(id); if (e) e.style.display = ""; });
    ["#ventasDia", "#mercanciaDia", "#instalacionDia", "#gastosDia"].forEach((id) => { const e = q(id); if (e) e.style.display = "none"; });
  }

  const logout = q("#btnCerrarSesion");
  if (logout) logout.onclick = async () => { await sb.auth.signOut(); window.location.href = "login.html"; };

  document.addEventListener("click", (e) => {
    const id = e.target && e.target.id;
    if (["btnVentasDia", "btnInstalacionDia", "btnGastosDia", "btnmercanciaDia"].includes(id)) showDay();
    if (["btnVentas", "btnInstalacion", "btnGastos", "btnmercancia"].includes(id)) showAll();
    const btnNew = e.target.closest(".btn-new-record");
    if (btnNew) {
      const target = btnNew.getAttribute("data-target-view");
      if (target) change(target);
    }
    const btnCancel = e.target.closest(".btn-cancel-form");
    if (btnCancel) {
      const target = btnCancel.getAttribute("data-target-view");
      if (target) change(target);
    }
  });

  const sidebar = q("#sidebar"), overlay = q("#sidebarOverlay"), openBtn = q("#btnToggleSidebar"), closeBtn = q("#btnCloseSidebar");
  if (openBtn) openBtn.onclick = () => { sidebar.classList.add("show"); overlay.classList.add("show"); };
  if (closeBtn) closeBtn.onclick = () => { sidebar.classList.remove("show"); overlay.classList.remove("show"); };
  if (overlay) overlay.onclick = () => { sidebar.classList.remove("show"); overlay.classList.remove("show"); };

  const views = {
    dashboard: "Panel Principal - Reportes y Estadísticas",
    "ventas-historial": "Historial de Ventas",
    "ventas-form": "Registrar Venta",
    "instalacion-historial": "Programacion de Instalaciones",
    "instalacion-form": "Registrar Programacion",
    "mercancia-historial": "Reporte de Mercancia",
    "mercancia-form": "Registrar Mercancia",
    "gastos-historial": "Gastos",
    "gastos-form": "Registrar Gasto",
    cartera: "Cartera de Clientes"
  };
  const links = document.querySelectorAll(".nav-link[data-view]"), title = q("#viewTitle");
  async function init(v) {
    showAll();
    if (v === "dashboard") await modDashboard();
    else if (v.startsWith("ventas")) await modVentas();
    else if (v.startsWith("instalacion")) await modInst();
    else if (v.startsWith("gastos")) await modGastos();
    else if (v.startsWith("mercancia")) await modMercancia();
    else if (v === "cartera") await modCartera();
  }
  function change(v) {
    const c = q("#viewContainer"); if (!c || !views[v]) return;
    c.innerHTML = '<div class="text-center p-5"><div class="spinner-border"></div></div>'; vistActual = v;
    fetch(`views/${v}.html`).then((r) => { if (!r.ok) throw new Error("Vista no encontrada"); return r.text(); }).then(async (html) => {
      c.innerHTML = html; if (title) title.textContent = views[v];
      links.forEach((l) => { l.classList.toggle("active", l.getAttribute("data-view") === v); });
      await init(v); if (sidebar) sidebar.classList.remove("show"); if (overlay) overlay.classList.remove("show");
    }).catch((err) => { console.error(err); c.innerHTML = '<div class="alert alert-danger">Error al cargar la vista</div>'; });
  }
  links.forEach((l) => l.addEventListener("click", (e) => { e.preventDefault(); change(l.getAttribute("data-view")); }));
  change("dashboard");
});
