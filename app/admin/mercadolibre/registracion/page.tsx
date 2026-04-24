import RegistracionAfipClient from "./registracion-afip-client";

export default function RegistracionAdminPage() {
    return (
        <div className="flex-col">
            <div className="flex-1 space-y-4 p-8 pt-6">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <h2 className="text-3xl font-black tracking-tight text-slate-800">Test de Registración ARCA</h2>
                        <p className="text-slate-500 font-medium">Panel provisional para pruebas de facturación electrónica con AFIP.</p>
                    </div>
                </div>

                <div className="h-[1px] w-full bg-slate-100 my-6" />

                <RegistracionAfipClient />
            </div>
        </div>
    );
}
