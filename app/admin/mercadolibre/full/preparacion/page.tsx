"use client"

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Camera, Search, RefreshCcw, ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { getRecentShipments, searchShipmentItems } from "@/app/actions/guia-full";
import { guardarAuditoriaFull } from "@/app/actions/preparacion-full";
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

        Swal.fire({ title: 'Guardando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const formData = new FormData();
        formData.append('photo', e.target.files[0]);
        formData.append('envioId', selectedEnvio);
        formData.append('itemId', item.id);
        formData.append('mla', item.title);

        const res = await guardarAuditoriaFull(formData);

        if (res.success) {
            Swal.fire({ icon: 'success', title: '¡Preparado!', timer: 1500, showConfirmButton: false });
        } else {
            Swal.fire('Error', res.error || 'No se pudo guardar', 'error');
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
                <h1 className="text-2xl font-bold text-gray-800">Preparación Full</h1>
                <Button variant="outline" onClick={loadShipments}><RefreshCcw className="h-4 w-4" /></Button>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border space-y-4">
                <Select value={selectedEnvio} onValueChange={setSelectedEnvio}>
                    <SelectTrigger className="h-12 text-lg font-bold text-blue-600">
                        <SelectValue placeholder="Cargando..." />
                    </SelectTrigger>
                    <SelectContent>
                        {shipments.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                </Select>
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
                    <Input 
                        placeholder="MLA, SKU o Nombre..." 
                        className="h-14 pl-12 text-lg rounded-xl"
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
                        <div className="w-32 h-32 rounded-xl bg-gray-50 border overflow-hidden flex-shrink-0">
                            <img src={item.image || "/placeholder.svg"} className="w-full h-full object-cover" alt="" />
                            <div className="absolute -top-2 -left-2 bg-blue-600 text-white text-xl font-bold w-10 h-10 flex items-center justify-center rounded-full shadow-lg border-2 border-white">
                                {item.quantity}
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                                <h2 className="text-xl font-bold truncate text-blue-700">{item.publicationName}</h2>
                                <label className="cursor-pointer p-3 bg-gray-100 hover:bg-gray-200 rounded-xl">
                                    <Camera className="h-6 w-6 text-gray-600" />
                                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleFileUpload(e, item)} />
                                </label>
                            </div>
                            <p className="font-semibold text-gray-800 mb-2">{item.title}</p>
                            <p className="text-xs font-bold text-gray-400 uppercase">SKU: {item.subtitle}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
