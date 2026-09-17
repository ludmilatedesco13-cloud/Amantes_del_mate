const DEFAULT_IMAGE = 'img/producto_defecto.jpg';
const role = (localStorage.getItem('rol') || 'admin').toLowerCase();
let productos = [];
let carritoVenta = [];
let subcategoriasPorCategoria = {}; // Se cargará dinámicamente desde Supabase

const money = value => Number(value || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const parsePrice = value => { const text = String(value ?? '').trim().replace(/\s/g, ''); if (!text) return NaN; if (text.includes(',')) return Number(text.replace(/\./g, '').replace(',', '.')); const parts = text.split('.'); return parts.length > 1 && parts.at(-1).length === 3 ? Number(parts.join('')) : Number(text); };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const showError = message => Swal.fire({ icon: 'error', title: 'Atención', text: message, confirmButtonColor: '#6B7B45' });
const showSuccess = (title, text) => Swal.fire({ icon: 'success', title, text, confirmButtonColor: '#6B7B45' });

// --- GESTIÓN DINÁMICA DE CATEGORÍAS Y SUBCATEGORÍAS ---

async function cargarCategoriasYSubcategorias() {
    try {
        // Asumiendo que tenés una tabla 'categorias' y otra 'subcategorias' en Supabase
        const [resCat, resSub] = await Promise.all([
            supabaseClient.from('categorias').select('*').order('nombre'),
            supabaseClient.from('subcategorias').select('*').order('nombre')
        ]);

        if (resCat.error) throw resCat.error;
        if (resSub.error) throw resSub.error;

        const selectCategoria = document.getElementById('categoria');
        const categoriaActual = selectCategoria.value;

        // Limpiar select de categorías manteniendo la opción por defecto
        selectCategoria.innerHTML = '<option value="">-- Seleccionar Categoría --</option>';
        
        subcategoriasPorCategoria = {};

        (resCat.data || []).forEach(cat => {
            selectCategoria.add(new Option(cat.nombre, cat.nombre));
            subcategoriasPorCategoria[cat.nombre] = [];
        });

        // Agrupar subcategorías por nombre de categoría
        (resSub.data || []).forEach(sub => {
            // Buscamos a qué categoría pertenece por ID o nombre según tu diseño
            const catRelacionada = resCat.data.find(c => c.id === sub.categoria_id)?.nombre || sub.categoria_nombre;
            if (catRelacionada && subcategoriasPorCategoria[catRelacionada]) {
                subcategoriasPorCategoria[catRelacionada].push(sub.nombre);
            }
        });

        if (categoriaActual) {
            selectCategoria.value = categoriaActual;
            actualizarSubcategorias();
        }
    } catch (error) {
        console.error('Error cargando clasificaciones:', error);
    }
}

function actualizarSubcategorias() { 
    const selectSub = document.getElementById('subcategoria');
    const catSeleccionada = document.getElementById('categoria').value;
    const subActual = selectSub.value;

    selectSub.innerHTML = '<option value="">-- Seleccionar Subcategoría --</option>'; 
    
    const subs = subcategoriasPorCategoria[catSeleccionada] || [];
    subs.forEach(value => selectSub.add(new Option(value, value)));

    if (subs.includes(subActual)) {
        selectSub.value = subActual;
    }
}

async function agregarNuevaCategoria() {
    const { value: nuevaCat } = await Swal.fire({
        title: 'Nueva Categoría',
        input: 'text',
        inputPlaceholder: 'Nombre de la categoría...',
        showCancelButton: true,
        confirmButtonColor: '#6B7B45',
        cancelButtonColor: '#A95C42',
        confirmButtonText: 'Guardar',
        cancelButtonText: 'Cancelar',
        inputValidator: (value) => {
            if (!value.trim()) return '¡Tenés que escribir un nombre!';
        }
    });

    if (nuevaCat) {
        try {
            const { error } = await supabaseClient.from('categorias').insert({ nombre: nuevaCat.trim() });
            if (error) throw error;
            await cargarCategoriasYSubcategorias();
            document.getElementById('categoria').value = nuevaCat.trim();
            actualizarSubcategorias();
            showSuccess('¡Creada!', 'La categoría fue agregada con éxito.');
        } catch (error) {
            showError('No se pudo guardar la categoría: ' + error.message);
        }
    }
}

async function agregarNuevaSubcategoria() {
    const catSeleccionada = document.getElementById('categoria').value;
    if (!catSeleccionada) {
        return showError('Primero seleccioná una categoría para añadirle una subcategoría.');
    }

    const { value: nuevaSub } = await Swal.fire({
        title: `Nueva Subcategoría para "${catSeleccionada}"`,
        input: 'text',
        inputPlaceholder: 'Nombre de la subcategoría...',
        showCancelButton: true,
        confirmButtonColor: '#6B7B45',
        cancelButtonColor: '#A95C42',
        confirmButtonText: 'Guardar',
        cancelButtonText: 'Cancelar',
        inputValidator: (value) => {
            if (!value.trim()) return '¡Tenés que escribir un nombre!';
        }
    });

    if (nuevaSub) {
        try {
            // Buscamos el ID de la categoría seleccionada
            const { data: catData, error: catError } = await supabaseClient
                .from('categorias')
                .select('id')
                .eq('nombre', catSeleccionada)
                .single();

            if (catError) throw catError;

            const { error } = await supabaseClient.from('subcategorias').insert({
                categoria_id: catData.id,
                nombre: nuevaSub.trim()
            });

            if (error) throw error;

            await cargarCategoriasYSubcategorias();
            document.getElementById('categoria').value = catSeleccionada;
            actualizarSubcategorias();
            document.getElementById('subcategoria').value = nuevaSub.trim();
            showSuccess('¡Creada!', 'La subcategoría fue agregada con éxito.');
        } catch (error) {
            showError('No se pudo guardar la subcategoría: ' + error.message);
        }
    }
}

// --- RESTO DE LAS FUNCIONES DEL SISTEMA ---

function aplicarRol() { 
    const admin = role === 'admin'; 
    document.querySelectorAll('.admin-only').forEach(element => { element.hidden = !admin; }); 
    document.getElementById('nombre-usuario').textContent = localStorage.getItem('usuario') || (admin ? 'Administrador' : 'Empleado'); 
}

function imageUrl(producto) {
    const path = producto.foto || producto.foto_url;
    if (!path) return DEFAULT_IMAGE;
    if (/^https?:\/\//i.test(path)) return path;
    return path.replace(/^\.?\//, '');
}

function renderDatalist() { 
    const list = document.getElementById('lista_productos'); 
    list.innerHTML = ''; 
    productos.filter(producto => Number(producto.stock) > 0).forEach(producto => { 
        const option = new Option(`${producto.nombre}${producto.marca ? ` (${producto.marca})` : ''}`); 
        option.dataset.id = producto.id; 
        list.appendChild(option); 
    }); 
}

function renderInventario() { 
    document.getElementById('tabla-inventario').innerHTML = productos.length ? productos.map(p => `
        <tr>
            <td>${escapeHtml(p.id)}</td>
            <td><strong>${escapeHtml(p.nombre)}</strong></td>
            <td>${escapeHtml(p.marca || '-')}</td>
            <td><span class="badge-categoria">${escapeHtml(p.categoria || '-')}</span><span class="subcategoria-texto">${escapeHtml(p.subcategoria || '')}</span></td>
            <td>$${money(p.precio_venta)}</td>
            <td>${escapeHtml(p.stock)} u.</td>
            <td>
                <button type="button" class="btn-icon btn-ver" data-id="${escapeHtml(p.id)}" title="Ver Detalles">🔎</button>
                ${role === 'admin' ? `<button type="button" class="btn-icon btn-editar" data-id="${escapeHtml(p.id)}" title="Editar" style="color:#556B2F;">✏️</button><button type="button" class="btn-icon btn-eliminar" data-id="${escapeHtml(p.id)}" title="Eliminar" style="color:#A95C42;">🗑️</button>` : ''}
            </td>
        </tr>`).join('') : '<tr><td colspan="7" style="text-align:center;">No hay productos registrados.</td></tr>'; 
}

async function cargarProductos() { 
    const { data, error } = await supabaseClient.from('productos').select('*').order('id'); 
    if (error) throw error; 
    productos = data || []; 
    renderInventario(); 
    renderDatalist(); 
}

async function cargarResumen() { 
    if (role !== 'admin') return; 
    const [ventas, stock] = await Promise.all([
        supabaseClient.from('ventas').select('total'), 
        supabaseClient.from('productos').select('id').eq('stock', 0)
    ]); 
    if (ventas.error) throw ventas.error; 
    if (stock.error) throw stock.error; 
    document.getElementById('total-ventas').textContent = ventas.data.length; 
    document.getElementById('caja-total').textContent = `$${money(ventas.data.reduce((sum, item) => sum + Number(item.total || 0), 0))}`; 
    document.getElementById('productos-sin-stock').textContent = stock.data.length; 
}

function actualizarTablaCarrito() { 
    const body = document.querySelector('#tabla-carrito tbody'); 
    body.innerHTML = carritoVenta.length ? carritoVenta.map((item, i) => `
        <tr>
            <td><strong>${escapeHtml(item.nombre)}</strong></td>
            <td>$${money(item.precio)}</td>
            <td>${item.cantidad}</td>
            <td>$${money(item.precio * item.cantidad)}</td>
            <td><button type="button" class="btn-icon quitar-item" data-index="${i}" style="color:#A95C42;">❌</button></td>
        </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;">El carrito está vacío.</td></tr>'; 
    document.getElementById('monto-total-venta').textContent = money(carritoVenta.reduce((sum, item) => sum + item.precio * item.cantidad, 0)); 
}

function agregarAlCarrito() { 
    const value = document.getElementById('producto_buscar').value.trim(); 
    const quantity = Number.parseInt(document.getElementById('cantidad').value, 10); 
    const product = productos.find(p => `${p.nombre}${p.marca ? ` (${p.marca})` : ''}` === value && Number(p.stock) > 0); 
    if (!product || !Number.isInteger(quantity) || quantity <= 0) return showError('Seleccioná un producto válido y una cantidad mayor a 0.'); 
    const existing = carritoVenta.find(item => item.id === product.id); 
    if ((existing?.cantidad || 0) + quantity > Number(product.stock)) return showError(`Stock insuficiente. Disponibles: ${product.stock} u.`); 
    if (existing) existing.cantidad += quantity; 
    else carritoVenta.push({ id: product.id, nombre: product.nombre, precio: Number(product.precio_venta), cantidad: quantity }); 
    document.getElementById('producto_buscar').value = ''; 
    actualizarTablaCarrito(); 
}

async function registrarVenta() { 
    if (!carritoVenta.length) return showError('Añadí al menos un producto antes de finalizar la venta.'); 
    const total = carritoVenta.reduce((sum, item) => sum + item.precio * item.cantidad, 0); 
    let ventaId; 
    const previous = new Map(carritoVenta.map(item => [item.id, Number(productos.find(p => p.id === item.id).stock)])); 
    const updated = []; 
    try { 
        const venta = await supabaseClient.from('ventas').insert({ total }).select('id').single(); 
        if (venta.error) throw venta.error; 
        ventaId = venta.data.id; 
        
        const details = await supabaseClient.from('detalle_venta').insert(carritoVenta.map(item => ({ 
            venta_id: ventaId, producto_id: item.id, cantidad: item.cantidad, precio_unitario: item.precio 
        }))); 
        if (details.error) throw details.error; 
        
        for (const item of carritoVenta) { 
            const result = await supabaseClient.from('productos').update({ stock: previous.get(item.id) - item.cantidad }).eq('id', item.id).eq('stock', previous.get(item.id)).select('id').single(); 
            if (result.error) throw result.error; 
            updated.push(item.id); 
        } 
        carritoVenta = []; 
        actualizarTablaCarrito(); 
        await Promise.all([cargarProductos(), cargarResumen()]); 
        showSuccess('¡Venta Registrada! 🧉', 'La operación fue exitosa y el stock ha sido actualizado.'); 
    } catch (error) { 
        await Promise.all(updated.map(id => supabaseClient.from('productos').update({ stock: previous.get(id) }).eq('id', id))); 
        if (ventaId) { 
            await supabaseClient.from('detalle_venta').delete().eq('venta_id', ventaId); 
            await supabaseClient.from('ventas').delete().eq('id', ventaId); 
        } 
        showError(error.message || 'No se pudo registrar la venta.'); 
    } 
}

async function uploadImage(file) {
    if (!file) return null;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('La imagen debe ser JPG, PNG o WEBP y pesar hasta 5 MB.');
    const path = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
    const upload = await supabaseClient.storage.from('img').upload(path, file, { upsert: false, contentType: file.type });
    if (upload.error) throw upload.error;
    return supabaseClient.storage.from('img').getPublicUrl(path).data.publicUrl;
}

async function guardarProducto(event) { 
    event.preventDefault(); 
    const form = event.currentTarget; 
    try { 
        const file = document.getElementById('foto').files[0]; 
        const priceCost = parsePrice(document.getElementById('precio_costo').value); 
        const priceSale = parsePrice(document.getElementById('precio_venta').value); 
        const stock = Number(document.getElementById('stock').value); 
        
        if (!document.getElementById('nombre').value.trim() || !Number.isFinite(priceCost) || priceCost <= 0 || !Number.isFinite(priceSale) || priceSale <= 0 || !Number.isInteger(stock) || stock < 0) {
            throw new Error('Completá los datos obligatorios con valores válidos.'); 
        }
        
        const photoUrl = await uploadImage(file); 
        const product = { 
            nombre: document.getElementById('nombre').value.trim(), 
            marca: document.getElementById('marca').value.trim(), 
            categoria: document.getElementById('categoria').value, 
            subcategoria: document.getElementById('subcategoria').value, 
            precio_costo: priceCost, 
            precio_venta: priceSale, 
            stock, 
            caracteristicas: document.getElementById('caracteristicas').value.trim(), 
            foto_url: photoUrl 
        }; 
        
        const result = await supabaseClient.from('productos').insert(product); 
        if (result.error) throw result.error; 
        
        form.reset(); 
        document.getElementById('foto').value = ''; 
        const preview = document.getElementById('vista-previa-foto'); 
        preview.removeAttribute('src'); 
        preview.style.display = 'none'; 
        actualizarSubcategorias(); 
        await Promise.all([cargarProductos(), cargarResumen()]); 
        showSuccess('¡Producto Guardado! 🌿', 'El artículo fue registrado con éxito.'); 
    } catch (error) { 
        showError(error.message); 
    } 
}

async function eliminarProducto(id) { 
    const product = productos.find(p => String(p.id) === String(id)); 
    const confirmation = await Swal.fire({ 
        title: '¿Seguro que quieres eliminar este producto?', 
        text: `Se eliminará "${product?.nombre || ''}" del inventario.`, 
        icon: 'warning', 
        showCancelButton: true, 
        confirmButtonColor: '#6B7B45', 
        cancelButtonColor: '#A95C42', 
        confirmButtonText: 'Sí, eliminar', 
        cancelButtonText: 'Cancelar', 
        reverseButtons: true 
    }); 
    if (!confirmation.isConfirmed) return; 
    const { error } = await supabaseClient.from('productos').delete().eq('id', id); 
    if (error) return showError(error.message); 
    await Promise.all([cargarProductos(), cargarResumen()]); 
    showSuccess('¡Eliminado! 🗑️', 'El artículo fue eliminado del inventario.'); 
}

function mostrarDetalle(product) { 
    document.getElementById('modal-titulo-prod').textContent = product.nombre; 
    document.getElementById('modal-marca-prod').textContent = product.marca || 'N/A'; 
    document.getElementById('modal-precio-prod').textContent = money(product.precio_venta); 
    document.getElementById('modal-stock-prod').textContent = product.stock; 
    document.getElementById('modal-info-prod').textContent = product.caracteristicas || 'Sin descripción.'; 
    document.getElementById('modal-img-prod').src = imageUrl(product); 
    document.getElementById('modal-detalles').style.display = 'flex'; 
}

async function cargarReporte() { 
    const [sales, details] = await Promise.all([
        supabaseClient.from('ventas').select('fecha,total').order('fecha', { ascending: false }), 
        supabaseClient.from('detalle_venta').select('cantidad, producto_id, productos(nombre,marca)')
    ]); 
    if (sales.error) throw sales.error; 
    if (details.error) throw details.error; 
    
    const months = {}; 
    sales.data.forEach(sale => { 
        const month = String(sale.fecha || '').slice(0, 7) || 'Sin fecha'; 
        months[month] = months[month] || { count: 0, total: 0 }; 
        months[month].count++; 
        months[month].total += Number(sale.total || 0); 
    }); 
    
    const best = {}; 
    details.data.forEach(detail => { 
        const name = detail.productos?.nombre || `Producto #${detail.producto_id}`; 
        best[name] = best[name] || { brand: detail.productos?.marca || '-', count: 0 }; 
        best[name].count += Number(detail.cantidad || 0); 
    }); 
    
    document.getElementById('resultadoEstadisticas').innerHTML = `
        <h3 style="color:#4E3629;">💰 Recaudación por Mes</h3>
        <ul style="list-style:none;padding:0;margin-bottom:15px;">${Object.entries(months).map(([month, item]) => `<li style="padding:8px 0;border-bottom:1px solid #EFECE6;display:flex;justify-content:space-between;"><span>📅 <strong>${escapeHtml(month)}</strong> (${item.count} ventas)</span><strong>$${money(item.total)}</strong></li>`).join('') || '<li>No hay ventas.</li>'}</ul>
        <h3 style="color:#4E3629;">🌿 Productos más Vendidos</h3>
        <ul style="list-style:none;padding:0;">${Object.entries(best).sort((a, b) => b[1].count - a[1].count).slice(0, 5).map(([name, item]) => `<li style="padding:8px 0;border-bottom:1px solid #EFECE6;display:flex;justify-content:space-between;"><span>🧉 <strong>${escapeHtml(name)}</strong> (${escapeHtml(item.brand)})</span><strong>${item.count} un.</strong></li>`).join('') || '<li>No hay datos.</li>'}</ul>`; 
    window.reporte = { sales: sales.data, best }; 
}

function descargarReporte() { 
    const report = window.reporte || { sales: [], best: {} }; 
    const rows = [['Mes', 'Cantidad de Operaciones', 'Total Recaudado ($)']]; 
    const months = {}; 
    report.sales.forEach(sale => { 
        const month = String(sale.fecha || '').slice(0, 7) || 'Sin fecha'; 
        months[month] = months[month] || { count: 0, total: 0 }; 
        months[month].count++; 
        months[month].total += Number(sale.total || 0); 
    }); 
    Object.entries(months).forEach(([month, item]) => rows.push([month, item.count, item.total.toFixed(2).replace('.', ',')])); 
    rows.push([], ['Producto', 'Marca', 'Unidades Vendidas']); 
    Object.entries(report.best).forEach(([name, item]) => rows.push([name, item.brand, item.count])); 
    
    const csv = '\uFEFF' + rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n'); 
    const link = document.createElement('a'); 
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); 
    link.download = `reporte_amantes_del_mate_${new Date().toISOString().slice(0, 10)}.csv`; 
    link.click(); 
    showSuccess('¡Reporte descargado!', 'El archivo CSV se generó con éxito.'); 
}

document.addEventListener('DOMContentLoaded', async () => { 
    if (!localStorage.getItem('usuario')) { window.location.replace('login.html'); return; } 
    aplicarRol(); 
    actualizarTablaCarrito(); 

    // Cargar categorías y subcategorías desde Supabase al iniciar
    await cargarCategoriasYSubcategorias();
    
    document.getElementById('categoria').addEventListener('change', actualizarSubcategorias); 
    
    // Listeners para los nuevos botones de agregar dinámicamente
    document.getElementById('btn-nueva-categoria').addEventListener('click', agregarNuevaCategoria);
    document.getElementById('btn-nueva-subcategoria').addEventListener('click', agregarNuevaSubcategoria);

    document.getElementById('btn-agregar-item').addEventListener('click', agregarAlCarrito); 
    document.getElementById('producto_buscar').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); agregarAlCarrito(); } }); 
    
    document.getElementById('foto').addEventListener('change', event => { 
        const preview = document.getElementById('vista-previa-foto'); 
        const file = event.target.files[0]; 
        if (!file) { preview.removeAttribute('src'); preview.style.display = 'none'; return; } 
        preview.src = URL.createObjectURL(file); 
        preview.style.display = 'block'; 
    }); 
    
    document.querySelector('#tabla-carrito tbody').addEventListener('click', event => { 
        const button = event.target.closest('.quitar-item'); 
        if (button) { carritoVenta.splice(Number(button.dataset.index), 1); actualizarTablaCarrito(); } 
    }); 
    
    document.getElementById('form-ventas-multiples').addEventListener('submit', event => { event.preventDefault(); registrarVenta(); }); 
    document.getElementById('form-nuevo-producto').addEventListener('submit', guardarProducto); 
    
    document.getElementById('tabla-inventario').addEventListener('click', event => { 
        const button = event.target.closest('button'); 
        if (!button) return; 
        const product = productos.find(item => String(item.id) === button.dataset.id); 
        if (!product) return; 
        if (button.classList.contains('btn-ver')) mostrarDetalle(product); 
        if (button.classList.contains('btn-editar')) window.location.href = `editar-producto.html?id=${encodeURIComponent(product.id)}`; 
        if (button.classList.contains('btn-eliminar')) eliminarProducto(product.id); 
    }); 
    
    document.getElementById('btn-close-modal').addEventListener('click', () => { document.getElementById('modal-detalles').style.display = 'none'; }); 
    document.getElementById('btnReporte').addEventListener('click', async event => { 
        event.preventDefault(); 
        document.getElementById('modalReporte').style.display = 'flex'; 
        try { await cargarReporte(); } catch (error) { showError(error.message); } 
    }); 
    document.getElementById('btn-exportar').addEventListener('click', descargarReporte); 
    document.getElementById('cerrarModalReporte').addEventListener('click', () => { document.getElementById('modalReporte').style.display = 'none'; }); 
    document.getElementById('btn-salir').addEventListener('click', () => { localStorage.clear(); window.location.href = 'login.html'; }); 
    
    try { await Promise.all([cargarProductos(), cargarResumen()]); } catch (error) { showError(`No se pudo cargar la información: ${error.message}`); } 
});