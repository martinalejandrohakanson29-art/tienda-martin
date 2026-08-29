// app/admin/mercadolibre/full/preparacion/page.tsx
"use client"

import { useState, useEffect, useRef, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { 
    Search, 
    Camera, 
    RefreshCcw, 
    ArrowLeft, 
    CheckCircle2, 
    AlertCircle, 
    Barcode, 
    Maximize2, 
    X, 
    Layers, 
    Package, 
    Loader2, 
    Trash2, 
    ExternalLink,
    Boxes,
    Eye,
    Sparkles,
    Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from "@/components/ui/select";
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle 
} from "@/components/ui/dialog";
import { 
    getRecentShipments, 
    getShipmentFullDetails, 
    ShipmentSummary, 
    PreparacionItemFull, 
    ShipmentDetailsFull 
} from "@/app/actions/guia-full";
import { guardarAuditoriaFull, eliminarAuditoriaFull } from "@/app/actions/preparacion-full";
import { Html5Qrcode } from "html5-qrcode";
import { toast } from "sonner";

const getAgregadoColor = (index: number) => {
    const colors = [
        "bg-blue-600 text-white border-blue-700",
        "bg-purple-600 text-white border-purple-700",
        "bg-orange-600 text-white border-orange-700",
        "bg-pink-600 text-white border-pink-700",
        "bg-indigo-600 text-white border-indigo-700",
        "bg-cyan-600 text-white border-cyan-700",
        "bg-emerald-600 text-white border-emerald-700",
    ];
    return colors[index % colors.length];
};

const renderTextWithQuantity = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\(x\d+\))/g);
    return parts.map((part, i) => 
        /(\(x\d+\))/.test(part) ? (
            <span key={i} className="bg-red-600 text-white px-1.5 py-0.5 rounded-md font-black mx-0.5 inline-block shadow-sm">
                {part}
            </span>
        ) : part
    );
};

// Visor interactivo con Zoom y Pan para imágenes
function ZoomViewer({
    src,
    title,
    onClose,
}: {
    src: string;
    title?: string;
    onClose: () => void;
}) {
    const SCALE = 2.8;
    const imgRef = useRef<HTMLImageElement>(null);
    const [zoomed, setZoomed] = useState(false);
    const [origin, setOrigin] = useState({ x: 50, y: 50 });

    const displaySrc = src.startsWith("/_next/image")
        ? src
        : `/_next/image?url=${encodeURIComponent(src)}&w=2048&q=90`;

    const posFrom = (clientX: number, clientY: number) => {
        const el = imgRef.current;
        if (!el) return { x: 50, y: 50 };
        const rect = el.getBoundingClientRect();
        const x = ((clientX - rect.left) / rect.width) * 100;
        const y = ((clientY - rect.top) / rect.height) * 100;
        return {
            x: Math.max(0, Math.min(100, x)),
            y: Math.max(0, Math.min(100, y)),
        };
    };

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (zoomed) {
            setZoomed(false);
        } else {
            setOrigin(posFrom(e.clientX, e.clientY));
            setZoomed(true);
        }
    };

    return (
        <div 
            className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-3 overflow-hidden animate-in fade-in"
            onClick={onClose}
        >
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10 pointer-events-none">
                <div className="bg-black/60 backdrop-blur text-white text-xs px-3 py-1.5 rounded-full font-medium max-w-[70vw] truncate pointer-events-auto">
                    {title || "Vista previa"}
                </div>
                <button 
                    className="h-10 w-10 bg-white/20 hover:bg-white/40 text-white rounded-full flex items-center justify-center pointer-events-auto transition-colors"
                    onClick={onClose}
                >
                    <X className="h-6 w-6" />
                </button>
            </div>

            <div className="absolute top-16 left-1/2 -translate-x-1/2 text-white/75 text-[11px] bg-black/60 px-3 py-1 rounded-full pointer-events-none z-10">
                {zoomed ? "Movete para explorar · Toca para alejar" : "Toca cualquier zona para acercar"}
            </div>

            <div className="w-full h-full flex items-center justify-center p-2 pt-12 overflow-hidden">
                <img
                    ref={imgRef}
                    src={displaySrc}
                    alt={title || "Zoom"}
                    draggable={false}
                    onClick={handleClick}
                    onMouseMove={(e) => { if (zoomed) setOrigin(posFrom(e.clientX, e.clientY)); }}
                    onTouchMove={(e) => { if (zoomed && e.touches[0]) { const t = e.touches[0]; setOrigin(posFrom(t.clientX, t.clientY)); } }}
                    className={`max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl select-none transition-transform duration-150 ${zoomed ? "cursor-zoom-out" : "cursor-zoom-in"}`}
                    style={{
                        transform: zoomed ? `scale(${SCALE})` : "scale(1)",
                        transformOrigin: `${origin.x}% ${origin.y}%`,
                    }}
                />
            </div>
        </div>
    );
}

export default function GuiaPreparacionPage() {
    const [shipments, setShipments] = useState<ShipmentSummary[]>([]);
    const [selectedEnvio, setSelectedEnvio] = useState<string>("");
    const [shipmentData, setShipmentData] = useState<ShipmentDetailsFull | null>(null);
    const [items, setItems] = useState<PreparacionItemFull[]>([]);
    const [query, setQuery] = useState("");
    const [filterTab, setFilterTab] = useState<'all' | 'pending' | 'prepared'>('all');
    const [loadingShipments, setLoadingShipments] = useState(false);
    const [loadingItems, setLoadingItems] = useState(false);
    const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
    const [expandedImage, setExpandedImage] = useState<{ src: string; title?: string } | null>(null);

    // Selección para la cámara
    const [activeItemForCamera, setActiveItemForCamera] = useState<PreparacionItemFull | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Escáner de código de barras
    const [showScanner, setShowScanner] = useState(false);
    const scannerRef = useRef<Html5Qrcode | null>(null);

    useEffect(() => {
        loadShipments();
    }, []);

    // Cargar envíos recientes
    async function loadShipments(preserveSelected = true) {
        setLoadingShipments(true);
        const data = await getRecentShipments();
        setShipments(data);
        if (data.length > 0) {
            if (!preserveSelected || !selectedEnvio || !data.some(s => s.id === selectedEnvio)) {
                setSelectedEnvio(data[0].id);
            }
        }
        setLoadingShipments(false);
    }

    // Cargar datos del envío seleccionado
    useEffect(() => {
        if (!selectedEnvio) {
            setShipmentData(null);
            setItems([]);
            return;
        }

        async function fetchDetails() {
            setLoadingItems(true);
            const data = await getShipmentFullDetails(selectedEnvio);
            if (data) {
                setShipmentData(data);
                setItems(data.items);
            } else {
                setShipmentData(null);
                setItems([]);
            }
            setLoadingItems(false);
        }

        fetchDetails();
    }, [selectedEnvio]);

    // Atajo de teclado: presionar '/' para enfocar el buscador en PC
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "/" && document.activeElement !== searchInputRef.current) {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    // Iniciar/Detener el Escáner de Código de Barras
    useEffect(() => {
        if (showScanner) {
            const startScanner = async () => {
                await new Promise(r => setTimeout(r, 300));
                const element = document.getElementById("full-barcode-reader");
                if (!element) return;

                const html5QrCode = new Html5Qrcode("full-barcode-reader");
                scannerRef.current = html5QrCode;

                try {
                    await html5QrCode.start(
                        { facingMode: "environment" },
                        {
                            fps: 10,
                            qrbox: { width: 260, height: 140 },
                        },
                        (decodedText) => {
                            if (navigator.vibrate) navigator.vibrate(100);
                            setQuery(decodedText);
                            setShowScanner(false);
                            toast.success(`Código detectado: ${decodedText}`);
                            stopScanner();
                        },
                        () => {}
                    );
                } catch (err) {
                    console.error("Error scanner:", err);
                    toast.error("No se pudo acceder a la cámara para escanear");
                    setShowScanner(false);
                }
            };
            startScanner();
        } else {
            stopScanner();
        }
        return () => { stopScanner(); };
    }, [showScanner]);

    const stopScanner = async () => {
        if (scannerRef.current && scannerRef.current.isScanning) {
            try {
                await scannerRef.current.stop();
                scannerRef.current = null;
            } catch (err) {
                console.error("Error al detener scanner:", err);
            }
        }
    };

    // Compresión de imagen antes de subir a S3
    const compressImage = (file: File): Promise<Blob> =>
        new Promise((resolve) => {
            const img = new window.Image();
            img.onload = () => {
                const MAX = 1400;
                let { width, height } = img;
                if (width > MAX || height > MAX) {
                    if (width > height) {
                        height = Math.round((height / width) * MAX);
                        width = MAX;
                    } else {
                        width = Math.round((width / height) * MAX);
                        height = MAX;
                    }
                }
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    resolve(file);
                    return;
                }
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob(
                    (b) => (b ? resolve(b) : resolve(file)),
                    "image/jpeg",
                    0.82
                );
            };
            img.onerror = () => resolve(file);
            img.src = URL.createObjectURL(file);
        });

    const handleTriggerCamera = (item: PreparacionItemFull) => {
        setActiveItemForCamera(item);
        fileInputRef.current?.click();
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !activeItemForCamera) return;

        const targetItem = activeItemForCamera;
        setUploadingItemId(targetItem.id);

        try {
            const compressedBlob = await compressImage(file);
            const formData = new FormData();
            formData.append("photo", compressedBlob, "auditoria.jpg");
            formData.append("envioId", selectedEnvio);
            formData.append("itemId", targetItem.id);
            formData.append("mla", targetItem.title);

            const res = await guardarAuditoriaFull(formData);

            if (res.success) {
                if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
                toast.success(`¡Artículo preparado con éxito!`);
                
                // Actualizar estado local inmediatamente para feedback instantáneo
                setItems(prev => prev.map(item => {
                    if (item.id === targetItem.id) {
                        return {
                            ...item,
                            isPrepared: true,
                            status: "PREPARADO",
                            photoUrl: res.photoUrl || item.photoUrl,
                            preparedAt: new Date()
                        };
                    }
                    return item;
                }));

                // Actualizar contadores del lote
                setShipmentData(prev => {
                    if (!prev) return prev;
                    const alreadyPrepared = targetItem.isPrepared;
                    const newPreparedCount = alreadyPrepared ? prev.stats.preparedItems : prev.stats.preparedItems + 1;
                    const newPreparedUnits = alreadyPrepared ? prev.stats.preparedUnits : prev.stats.preparedUnits + (targetItem.quantity || 0);
                    return {
                        ...prev,
                        stats: {
                            ...prev.stats,
                            preparedItems: newPreparedCount,
                            pendingItems: prev.stats.totalItems - newPreparedCount,
                            preparedUnits: newPreparedUnits,
                            progressPercentage: prev.stats.totalItems > 0 ? Math.round((newPreparedCount / prev.stats.totalItems) * 100) : 0
                        }
                    };
                });

                // Actualizar lista de envíos en segundo plano
                setShipments(prev => prev.map(s => {
                    if (s.id === selectedEnvio && !targetItem.isPrepared) {
                        return { ...s, preparedItems: s.preparedItems + 1 };
                    }
                    return s;
                }));
            } else {
                toast.error(res.error || "No se pudo guardar la foto");
            }
        } catch (err: any) {
            console.error("Error subiendo foto:", err);
            toast.error("Error de conexión al subir la foto");
        } finally {
            setUploadingItemId(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleDeletePhoto = async (item: PreparacionItemFull) => {
        if (!confirm(`¿Deseas eliminar la foto de preparación de este ítem?`)) return;

        setUploadingItemId(item.id);
        const res = await eliminarAuditoriaFull(selectedEnvio, item.id);
        if (res.success) {
            toast.warning("Foto eliminada. El ítem volvió a pendiente.");
            setItems(prev => prev.map(i => i.id === item.id ? { ...i, isPrepared: false, status: "PENDIENTE", photoUrl: null } : i));
            setShipmentData(prev => {
                if (!prev) return prev;
                const newPrepared = Math.max(0, prev.stats.preparedItems - 1);
                const newPreparedUnits = Math.max(0, prev.stats.preparedUnits - item.quantity);
                return {
                    ...prev,
                    stats: {
                        ...prev.stats,
                        preparedItems: newPrepared,
                        pendingItems: prev.stats.totalItems - newPrepared,
                        preparedUnits: newPreparedUnits,
                        progressPercentage: prev.stats.totalItems > 0 ? Math.round((newPrepared / prev.stats.totalItems) * 100) : 0
                    }
                };
            });
            setShipments(prev => prev.map(s => s.id === selectedEnvio ? { ...s, preparedItems: Math.max(0, s.preparedItems - 1) } : s));
        } else {
            toast.error(res.error || "Error al eliminar");
        }
        setUploadingItemId(null);
    };

    // Filtrado de elementos
    const filteredItems = useMemo(() => {
        let list = items;

        if (filterTab === 'pending') {
            list = list.filter(i => !i.isPrepared);
        } else if (filterTab === 'prepared') {
            list = list.filter(i => i.isPrepared);
        }

        if (query.trim()) {
            const q = query.toLowerCase().trim();
            list = list.filter(i => 
                i.title.toLowerCase().includes(q) ||
                i.subtitle.toLowerCase().includes(q) ||
                i.publicationName.toLowerCase().includes(q) ||
                (i.variation && i.variation.toLowerCase().includes(q)) ||
                (i.receta && i.receta.toLowerCase().includes(q)) ||
                (i.componentes_ids && i.componentes_ids.toLowerCase().includes(q))
            );
        }

        return list;
    }, [items, filterTab, query]);

    const stats = shipmentData?.stats || {
        totalItems: items.length,
        preparedItems: items.filter(i => i.isPrepared).length,
        pendingItems: items.filter(i => !i.isPrepared).length,
        totalUnits: items.reduce((acc, i) => acc + (i.quantity || 0), 0),
        preparedUnits: items.filter(i => i.isPrepared).reduce((acc, i) => acc + (i.quantity || 0), 0),
        progressPercentage: items.length > 0 ? Math.round((items.filter(i => i.isPrepared).length / items.length) * 100) : 0
    };

    return (
        <div className="max-w-6xl mx-auto p-3 sm:p-5 md:p-6 space-y-4 pb-24 font-sans select-none">
            {/* Input oculto para captura con la cámara trasera */}
            <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileUpload}
            />

            {/* Modal de Zoom */}
            {expandedImage && (
                <ZoomViewer
                    src={expandedImage.src}
                    title={expandedImage.title}
                    onClose={() => setExpandedImage(null)}
                />
            )}

            {/* Modal del Escáner de Código de Barras */}
            <Dialog open={showScanner} onOpenChange={setShowScanner}>
                <DialogContent className="sm:max-w-md p-4 bg-slate-900 text-white border-slate-800 rounded-3xl">
                    <DialogHeader className="pb-2">
                        <DialogTitle className="text-base sm:text-lg font-bold flex items-center gap-2 text-white">
                            <Barcode className="h-5 w-5 text-blue-400" /> Escanear Código o Etiqueta
                        </DialogTitle>
                    </DialogHeader>
                    <div className="relative aspect-[4/3] w-full bg-black rounded-2xl overflow-hidden border border-slate-700 flex flex-col items-center justify-center">
                        <div id="full-barcode-reader" className="w-full h-full" />
                    </div>
                    <p className="text-center text-xs text-slate-400 mt-2">
                        Apunta al código de barras o QR de la pieza para filtrarla al instante.
                    </p>
                    <Button 
                        variant="secondary" 
                        className="w-full mt-2 rounded-xl bg-slate-800 text-white hover:bg-slate-700 font-bold"
                        onClick={() => setShowScanner(false)}
                    >
                        Cerrar Escáner
                    </Button>
                </DialogContent>
            </Dialog>

            {/* BARRA SUPERIOR: Navegación y selector de envío */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-3">
                    <Link href="/admin/mercadolibre/full">
                        <Button variant="outline" size="sm" className="h-10 px-3 gap-1.5 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-100 font-bold">
                            <ArrowLeft className="h-4 w-4" />
                            <span className="hidden sm:inline">Volver</span>
                        </Button>
                    </Link>
                    <div>
                        <h1 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                            Preparación Full
                            <span className="text-[11px] font-bold uppercase tracking-wider bg-purple-100 text-purple-800 px-2 py-0.5 rounded-md">
                                Depósito
                            </span>
                        </h1>
                        <p className="text-xs text-slate-500 hidden sm:block">
                            Verificación de recetas y registro fotográfico de stock
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {/* Selector de envío */}
                    <div className="flex-1 sm:w-72">
                        <Select value={selectedEnvio} onValueChange={setSelectedEnvio}>
                            <SelectTrigger className="h-11 rounded-xl font-bold text-sm bg-slate-50 border-slate-200 text-blue-700 focus:ring-blue-500">
                                <SelectValue placeholder={loadingShipments ? "Cargando envíos..." : "Selecciona un envío"} />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl max-h-72">
                                {shipments.map(s => (
                                    <SelectItem key={s.id} value={s.id} className="py-2 font-medium">
                                        <div className="flex items-center justify-between w-full gap-2">
                                            <span className="truncate">{s.name}</span>
                                            <span className="text-[10px] font-bold bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 shrink-0">
                                                {s.preparedItems}/{s.totalItems}
                                            </span>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Botón de refresco */}
                    <Button 
                        variant="outline" 
                        size="icon" 
                        className="h-11 w-11 rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50 shrink-0"
                        onClick={() => {
                            loadShipments();
                            if (selectedEnvio) {
                                getShipmentFullDetails(selectedEnvio).then(data => {
                                    if (data) {
                                        setShipmentData(data);
                                        setItems(data.items);
                                    }
                                });
                            }
                        }}
                        disabled={loadingShipments || loadingItems}
                        title="Actualizar datos"
                    >
                        <RefreshCcw className={`h-4 w-4 ${loadingShipments || loadingItems ? 'animate-spin text-blue-600' : ''}`} />
                    </Button>
                </div>
            </div>

            {/* PANEL DE ESTADÍSTICAS Y PROGRESO DEL ENVÍO */}
            {shipmentData && (
                <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                            <Boxes className="h-5 w-5 text-purple-600 shrink-0" />
                            <span className="font-extrabold text-sm sm:text-base text-slate-900 truncate">
                                {shipmentData.name}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-xs font-black text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
                                {stats.progressPercentage}% COMPLETADO
                            </span>
                        </div>
                    </div>

                    {/* Barra de progreso */}
                    <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden p-0.5 border border-slate-200">
                        <div 
                            className={`h-full rounded-full transition-all duration-500 ${stats.progressPercentage === 100 ? 'bg-emerald-500' : 'bg-blue-600'}`}
                            style={{ width: `${stats.progressPercentage}%` }}
                        />
                    </div>

                    {/* Métricas en cuadrícula */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Artículos</p>
                            <p className="text-base sm:text-lg font-black text-slate-800">{stats.totalItems}</p>
                        </div>
                        <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Total Unidades</p>
                            <p className="text-base sm:text-lg font-black text-blue-600">{stats.totalUnits}</p>
                        </div>
                        <div className="bg-emerald-50/60 p-2.5 rounded-xl border border-emerald-100 text-center">
                            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-tight">Preparados</p>
                            <p className="text-base sm:text-lg font-black text-emerald-700">{stats.preparedItems}</p>
                        </div>
                        <div className="bg-amber-50/60 p-2.5 rounded-xl border border-amber-100 text-center">
                            <p className="text-[10px] font-bold text-amber-700 uppercase tracking-tight">Pendientes</p>
                            <p className="text-base sm:text-lg font-black text-amber-700">{stats.pendingItems}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* BARRA DE BÚSQUEDA Y FILTROS FIJA/STICKY */}
            <div className="sticky top-2 z-20 space-y-2 bg-slate-50/95 backdrop-blur-md pt-1 pb-2">
                {/* Pestañas de estado */}
                <div className="flex bg-slate-200/80 p-1 rounded-xl gap-1 shadow-sm border border-slate-300/60">
                    <button
                        onClick={() => setFilterTab('all')}
                        className={`flex-1 py-2 text-xs sm:text-sm font-black rounded-lg transition-all flex items-center justify-center gap-1.5 ${filterTab === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                        Todos <span className="bg-slate-100 text-slate-700 text-[10px] font-black px-1.5 py-0.2 rounded-md">{items.length}</span>
                    </button>
                    <button
                        onClick={() => setFilterTab('pending')}
                        className={`flex-1 py-2 text-xs sm:text-sm font-black rounded-lg transition-all flex items-center justify-center gap-1.5 ${filterTab === 'pending' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                        Pendientes 
                        {stats.pendingItems > 0 && (
                            <span className="bg-amber-500 text-white text-[10px] font-black px-1.5 py-0.2 rounded-md">
                                {stats.pendingItems}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setFilterTab('prepared')}
                        className={`flex-1 py-2 text-xs sm:text-sm font-black rounded-lg transition-all flex items-center justify-center gap-1.5 ${filterTab === 'prepared' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                        Preparados 
                        {stats.preparedItems > 0 && (
                            <span className="bg-emerald-600 text-white text-[10px] font-black px-1.5 py-0.2 rounded-md">
                                {stats.preparedItems}
                            </span>
                        )}
                    </button>
                </div>

                {/* Buscador y botón de escáner */}
                <div className="flex gap-2 items-center bg-white p-2 sm:p-3 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="relative flex-1">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4 sm:h-5 sm:w-5" />
                        <Input
                            ref={searchInputRef}
                            placeholder="Buscar MLA, SKU, nombre, receta... (o presiona '/')"
                            className="h-11 sm:h-12 pl-10 sm:pl-11 pr-9 text-sm sm:text-base rounded-xl border-none bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-500"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                        {query && (
                            <button 
                                onClick={() => setQuery("")}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-full"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>

                    <Button
                        variant="outline"
                        className="h-11 sm:h-12 px-3 sm:px-4 rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center gap-1.5 shrink-0 shadow-sm font-bold active:scale-95"
                        onClick={() => setShowScanner(true)}
                        title="Escanear código de barras con la cámara"
                    >
                        <Barcode className="h-5 w-5 text-blue-600" />
                        <span className="hidden sm:inline text-xs">Escanear</span>
                    </Button>
                </div>
            </div>

            {/* LISTADO DE ARTÍCULOS */}
            {loadingItems ? (
                <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 space-y-3">
                    <Loader2 className="h-10 w-10 mx-auto text-blue-600 animate-spin" />
                    <p className="text-sm font-bold text-slate-600">Cargando artículos del lote Full...</p>
                </div>
            ) : filteredItems.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 space-y-3">
                    <Package className="h-12 w-12 mx-auto text-slate-300 opacity-50" />
                    <h3 className="text-base font-bold text-slate-700">No se encontraron artículos</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                        {query ? `No hay resultados para "${query}". Revisa el término de búsqueda o limpia el filtro.` : `No hay artículos en la categoría seleccionada.`}
                    </p>
                    {query && (
                        <Button variant="outline" size="sm" onClick={() => setQuery("")} className="rounded-xl mt-2 font-bold">
                            Limpiar búsqueda
                        </Button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-4">
                    {filteredItems.map((item) => {
                        const isUploading = uploadingItemId === item.id;

                        return (
                            <div 
                                key={item.id} 
                                className={`bg-white rounded-2xl p-3.5 sm:p-4 border transition-all duration-200 shadow-sm flex flex-col justify-between gap-3 relative overflow-hidden ${item.isPrepared ? 'border-emerald-300 bg-emerald-50/10' : 'border-slate-200 hover:border-slate-300'}`}
                            >
                                {/* Cinta superior con Badges */}
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                                        {/* Cantidad ULTRA PROMINENTE */}
                                        <div className={`px-2.5 py-1 rounded-lg text-sm sm:text-base font-black flex items-center gap-1 shadow-sm shrink-0 ${item.isPrepared ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'}`}>
                                            <span>x{item.quantity}</span>
                                            <span className="text-[10px] font-bold uppercase opacity-90">u.</span>
                                        </div>

                                        {/* SKU */}
                                        <span className="bg-slate-100 text-slate-700 text-[11px] font-black px-2 py-1 rounded-md border border-slate-200 truncate">
                                            SKU: {item.subtitle}
                                        </span>

                                        {/* MLA */}
                                        <span className="bg-slate-100 text-slate-500 text-[10px] font-mono font-bold px-1.5 py-1 rounded-md">
                                            {item.itemId}
                                        </span>

                                        {/* Variante */}
                                        {item.variation && (
                                            <span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded-md border border-indigo-100 truncate max-w-[180px]">
                                                {item.variation}
                                            </span>
                                        )}
                                    </div>

                                    {/* Estado */}
                                    {item.isPrepared ? (
                                        <span className="flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[11px] font-black px-2 py-0.5 rounded-full shrink-0">
                                            <CheckCircle2 className="h-3.5 w-3.5" /> OK
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                                            Pendiente
                                        </span>
                                    )}
                                </div>

                                {/* Cuerpo Principal: Imagen + Info de Producto */}
                                <div className="flex gap-3 sm:gap-4 items-start">
                                    {/* Imagen de referencia con Zoom */}
                                    <div 
                                        className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl bg-slate-50 border border-slate-200 overflow-hidden shrink-0 relative cursor-zoom-in group shadow-inner"
                                        onClick={() => item.image && setExpandedImage({ src: item.image, title: item.publicationName })}
                                    >
                                        {item.image ? (
                                            <>
                                                <Image 
                                                    src={item.image} 
                                                    alt={item.publicationName} 
                                                    fill 
                                                    sizes="96px"
                                                    className="object-contain p-1 group-hover:scale-105 transition-transform" 
                                                />
                                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                    <Maximize2 className="h-4 w-4 text-white drop-shadow" />
                                                </div>
                                            </>
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                <Package className="h-8 w-8" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Título y detalles */}
                                    <div className="flex-1 min-w-0 space-y-1.5">
                                        <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug break-words">
                                            {item.publicationName}
                                        </h3>

                                        {/* Desglose de Receta / Agregados */}
                                        {item.receta ? (
                                            <div className="p-2 sm:p-2.5 bg-amber-50/80 rounded-xl border border-amber-200/80 space-y-1.5">
                                                <p className="text-[10px] font-black text-amber-800 uppercase tracking-wider flex items-center gap-1">
                                                    <Layers className="h-3 w-3 text-amber-600" />
                                                    Composición de la Receta:
                                                </p>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {item.receta.split(' + ').map((r: string, idx: number) => (
                                                        <div 
                                                            key={idx} 
                                                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border font-bold text-[11px] uppercase shadow-xs ${getAgregadoColor(idx)}`}
                                                        >
                                                            <span>{renderTextWithQuantity(r)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                                {item.componentes_ids && (
                                                    <div className="pt-1 border-t border-amber-200/60 flex flex-wrap gap-1">
                                                        {item.componentes_ids.split(' + ').map((id: string, idx: number) => (
                                                            <span key={idx} className="text-[9px] font-mono font-bold bg-white/80 px-1.5 py-0.5 rounded border border-amber-200 text-amber-900">
                                                                {id}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ) : item.agregados && item.agregados.length > 0 ? (
                                            <div className="flex flex-wrap gap-1 pt-1">
                                                {item.agregados.map((a: string, idx: number) => (
                                                    <span key={idx} className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${getAgregadoColor(idx)}`}>
                                                        {renderTextWithQuantity(a)}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                </div>

                                {/* Zona de Acción / Foto de Evidencia */}
                                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                                    {item.isPrepared && item.photoUrl ? (
                                        <div className="flex items-center justify-between w-full gap-2 bg-emerald-50/70 p-2 rounded-xl border border-emerald-200">
                                            <div 
                                                className="flex items-center gap-2 cursor-pointer group"
                                                onClick={() => setExpandedImage({ src: item.photoUrl!, title: `Evidencia: ${item.publicationName}` })}
                                            >
                                                <div className="relative h-10 w-10 rounded-lg overflow-hidden border border-emerald-300 shrink-0 bg-white">
                                                    <Image src={item.photoUrl} alt="Foto subida" fill sizes="40px" className="object-cover" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-black text-emerald-800 flex items-center gap-1">
                                                        <Check className="h-3.5 w-3.5 text-emerald-600" /> Foto Guardada
                                                    </p>
                                                    <p className="text-[10px] text-emerald-600 font-medium group-hover:underline">
                                                        Toca para ampliar
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1 shrink-0">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-9 px-2.5 rounded-lg border-emerald-300 text-emerald-700 hover:bg-emerald-100 text-xs font-bold gap-1"
                                                    onClick={() => handleTriggerCamera(item)}
                                                    disabled={isUploading}
                                                >
                                                    {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                                                    <span className="hidden sm:inline">Cambiar</span>
                                                </Button>

                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-9 w-9 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700"
                                                    onClick={() => handleDeletePhoto(item)}
                                                    disabled={isUploading}
                                                    title="Eliminar foto"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <Button
                                            className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm shadow-md active:scale-98 transition-transform gap-2 flex items-center justify-center"
                                            onClick={() => handleTriggerCamera(item)}
                                            disabled={isUploading}
                                        >
                                            {isUploading ? (
                                                <>
                                                    <Loader2 className="h-5 w-5 animate-spin" />
                                                    <span>Guardando foto...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Camera className="h-5 w-5" />
                                                    <span>Tomar Foto de Preparación</span>
                                                </>
                                            )}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
