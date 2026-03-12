// martinalejandrohakanson29-art/tienda-martin/app/admin/mercadolibre/full/preparacion/page.tsx
"use client"

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Search, RefreshCcw, ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { getRecentShipments, searchShipmentItems } from "@/app/actions/guia-full";
import { subirFotoAuditoria } from "@/app/actions/preparacion";
import Swal from "sweetalert2";

export default function GuiaPreparacionPage() {
    const [shipments, setShipments] = useState<{id: string, name: string}[]>([]);
    const [selectedEnvio, setSelectedEnvio] = useState<string>("");
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadShipments();
    }, []);

    async function loadShipments() {
        const data = await getRecentShipments();
        setShipments(data);
        if (data.length > 0) setSelectedEnvio(data[0].id);
    }

    useEffect(() => {
        const timer = setTimeout(() => {
            if (query.length >= 2) handleSearch();
            else setResults([]);
        }, 400);
        return () => clearTimeout(timer);
    }, [query, selectedEnvio]);

    async function handleSearch() {
        setLoading(true);
        const data = await searchShipmentItems(query, selectedEnvio);
        setResults(data);
        setLoading(false);
    }

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>, item: any) {
        if (!e.target.files?.[0]) return;

        Swal.fire({ title: 'Subiendo...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const formData = new FormData();
        formData.append('photo', e.target.files[0]);
        formData.append('envioId', selectedEnvio);
        formData.append('itemId', item.id); // Usamos el ID único de la tabla
        formData.append('mla', item.title); // Para el nombre del archivo

        const res = await subirFotoAuditoria(formData);

        if (res.success) {
            Swal.fire({ icon: 'success', title: '¡Foto guardada!', timer: 1500, showConfirmButton: false });
        } else {
            Swal.fire('Error', res.error || 'No se pudo subir', 'error');
        }
    }

    return (
        <div className="max-w-4xl mx-auto p-4 space-y-6 pb-20">
            <div className="flex items-center justify-between">
                <Link href="/admin/mercadolibre/full">
                    <Button variant="ghost" size="sm" className="gap-2">
                        <ArrowLeft className="h-4 w-4" /> Volver
                    </Button>
                </Link>
                <h1 className="text-2xl font-bold text-gray-800">Guía de Preparación</h1>
                <Button variant="outline" size="icon" onClick={loadShipments}><RefreshCcw className="h-4 w-4" /></Button>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                        <label className="text-xs font-bold uppercase text-gray-500 mb-1 block">Seleccionar Envío</label>
                        <Select value={selectedEnvio} onValueChange={setSelectedEnvio}>
                            <SelectTrigger className="h-12 text-lg font-bold text-blue-600">
                                <SelectValue placeholder="Cargando envíos..." />
                            </SelectTrigger>
                            <SelectContent>
                                {shipments.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
                    <Input 
                        placeholder="MLA, SKU o Nombre..." 
                        className="h-14 pl-12 text-lg rounded-xl focus:ring-2 focus:ring-blue-500"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoFocus
                    />
                    {loading && <div className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>}
                </div>
            </div>

            <div className="space-y-4">
                {results.map((item) => (
                    <div key={item.id} className="bg-white rounded-2xl p-4 shadow-sm border flex flex-col sm:flex-row gap-4 relative">
                        <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-xl bg-gray-50 border overflow-hidden flex-shrink-0">
                            <img src={item.image || "/placeholder.svg"} className="w-full h-full object-cover" />
                            <div className="absolute -top-2 -left-2 bg-blue-600 text-white text-xl font-bold w-10 h-10 flex items-center justify-center rounded-full shadow-lg border-2 border-white">
                                {item.quantity}
                            </div>
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                                <h2 className="text-xl font-bold truncate text-blue-700">{item.title}</h2>
                                <label className="cursor-pointer p-3 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
                                    <Camera className="h-6 w-6 text-gray-600" />
                                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFileUpload(e, item)} />
                                </label>
                            </div>
                            <p className="font-semibold text-gray-800 leading-tight mb-2">{item.publicationName}</p>
                            {item.variation && <span className="inline-block bg-purple-100 text-purple-700 text-xs font-bold px-2 py-1 rounded mb-2">VAR: {item.variation}</span>}
                            <p className="text-xs font-bold text-gray-400 uppercase">SKU: {item.subtitle}</p>

                            {item.agregados.length > 0 && (
                                <div className="mt-3 bg-blue-50 p-3 rounded-lg border border-blue-100">
                                    <p className="text-[10px] font-black text-blue-600 uppercase mb-1">Agregados:</p>
                                    <ul className="space-y-1">
                                        {item.agregados.map((a: string, i: number) => (
                                            <li key={i} className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                                <CheckCircle2 className="h-3 w-3 text-blue-500" /> {a}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
