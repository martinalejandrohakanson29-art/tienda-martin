// app/actions/guia-full.ts
"use server"

import { prisma } from "@/lib/prisma";
import { crearResolverAgregados } from "@/lib/agregados";
import { s3Client } from "@/lib/s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

export interface ShipmentSummary {
  id: string;
  name: string;
  createdAt: Date;
  totalItems: number;
  preparedItems: number;
  totalUnits: number;
}

export interface PreparacionItemFull {
  id: string;
  itemId: string; // MLA
  title: string;  // MLA code (e.g. MLA123456)
  subtitle: string; // SKU
  publicationName: string;
  variation: string | null;
  image: string | null;
  quantity: number;
  isPrepared: boolean;
  photoUrl: string | null;
  preparedAt: Date | null;
  status: string;
  auditor: string | null;
  agregados: string[];
  receta: string | null;
  componentes_ids: string | null;
  componentes: {
    id_articulo: string;
    nombre_articulo: string | null;
    cantidad: number;
  }[];
}

export interface ShipmentDetailsFull {
  id: string;
  name: string;
  createdAt: Date;
  stats: {
    totalItems: number;
    preparedItems: number;
    pendingItems: number;
    totalUnits: number;
    preparedUnits: number;
    progressPercentage: number;
  };
  items: PreparacionItemFull[];
}

export async function getRecentShipments(): Promise<ShipmentSummary[]> {
  try {
    const shipments = await prisma.shipment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        items: {
          select: {
            id: true,
            quantity: true
          }
        }
      }
    });

    if (shipments.length === 0) return [];

    const shipmentIds = shipments.map(s => s.id);
    const audits = await prisma.auditoriaPreparacionFull.findMany({
      where: {
        shipmentId: { in: shipmentIds },
        status: "PREPARADO"
      },
      select: { shipmentId: true, itemId: true }
    });

    const preparedSet = new Map<string, Set<string>>();
    audits.forEach(a => {
      if (!preparedSet.has(a.shipmentId)) {
        preparedSet.set(a.shipmentId, new Set());
      }
      preparedSet.get(a.shipmentId)!.add(a.itemId);
    });

    return shipments.map(s => {
      const itemsInShipment = s.items || [];
      const totalUnits = itemsInShipment.reduce((acc, it) => acc + (it.quantity || 0), 0);
      const set = preparedSet.get(s.id);
      const preparedCount = set ? set.size : 0;

      return {
        id: s.id,
        name: s.name,
        createdAt: s.createdAt,
        totalItems: itemsInShipment.length,
        preparedItems: preparedCount,
        totalUnits
      };
    });
  } catch (error) {
    console.error("Error obteniendo envíos:", error);
    return [];
  }
}

export async function getShipmentFullDetails(shipmentId: string): Promise<ShipmentDetailsFull | null> {
  if (!shipmentId) return null;

  try {
    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        items: {
          orderBy: { title: 'asc' }
        }
      }
    });

    if (!shipment) return null;

    const [audits, shipmentAudits] = await Promise.all([
      prisma.auditoriaPreparacionFull.findMany({
        where: { shipmentId }
      }),
      prisma.shipmentAudit.findMany({
        where: { envioId: shipmentId }
      })
    ]);

    const auditMap = new Map<string, typeof audits[0]>();
    audits.forEach(a => auditMap.set(a.itemId, a));

    const shipmentAuditMap = new Map<string, typeof shipmentAudits[0]>();
    shipmentAudits.forEach(sa => shipmentAuditMap.set(sa.itemId, sa));

    const resolverAgregados = await crearResolverAgregados(shipment.items.map(i => i.itemId));

    const itemsWithData = await Promise.all(
      shipment.items.map(async (item) => {
        const componentes = resolverAgregados(item.itemId, item.variation);
        const auditRecord = auditMap.get(item.id);
        const shipAuditRecord = shipmentAuditMap.get(item.id);

        let signedPhotoUrl: string | null = null;
        if (auditRecord?.photoUrl) {
          try {
            const getCommand = new GetObjectCommand({
              Bucket: BUCKET_NAME,
              Key: auditRecord.photoUrl
            });
            signedPhotoUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
          } catch (err) {
            console.error("Error firmando URL de foto S3:", err);
          }
        }

        const isPrepared = Boolean(auditRecord && (auditRecord.photoUrl || auditRecord.status === "PREPARADO"));
        const auditStatus = shipAuditRecord?.status || (isPrepared ? "PREPARADO" : "PENDIENTE");

        return {
          id: item.id,
          itemId: item.itemId,
          title: item.itemId,
          subtitle: item.sku || "Sin SKU",
          publicationName: item.title,
          variation: item.variation,
          image: item.imageUrl,
          quantity: item.quantity,
          isPrepared,
          photoUrl: signedPhotoUrl,
          preparedAt: auditRecord?.createdAt || null,
          status: auditStatus,
          auditor: shipAuditRecord?.auditor || null,
          agregados: item.agregados ? item.agregados.split(',').map((s: string) => s.trim()) : [],
          receta: componentes.length > 0
            ? componentes.map(c => `${c.nombre_articulo || c.id_articulo} (x${c.cantidad})`).join(' + ')
            : null,
          componentes_ids: componentes.length > 0
            ? componentes.map(c => c.id_articulo).join(' + ')
            : null,
          componentes: componentes.map(c => ({
            id_articulo: c.id_articulo,
            nombre_articulo: c.nombre_articulo,
            cantidad: c.cantidad
          }))
        };
      })
    );

    const totalItems = itemsWithData.length;
    const preparedItems = itemsWithData.filter(i => i.isPrepared).length;
    const pendingItems = totalItems - preparedItems;

    const totalUnits = itemsWithData.reduce((acc, i) => acc + (i.quantity || 0), 0);
    const preparedUnits = itemsWithData
      .filter(i => i.isPrepared)
      .reduce((acc, i) => acc + (i.quantity || 0), 0);

    const progressPercentage = totalItems > 0 ? Math.round((preparedItems / totalItems) * 100) : 0;

    return {
      id: shipment.id,
      name: shipment.name,
      createdAt: shipment.createdAt,
      stats: {
        totalItems,
        preparedItems,
        pendingItems,
        totalUnits,
        preparedUnits,
        progressPercentage
      },
      items: itemsWithData
    };
  } catch (error) {
    console.error("Error obteniendo detalles del envío Full:", error);
    return null;
  }
}

export async function searchShipmentItems(query: string, shipmentId: string) {
  if (!shipmentId) return [];

  try {
    const details = await getShipmentFullDetails(shipmentId);
    if (!details) return [];

    if (!query || query.trim().length === 0) {
      return details.items;
    }

    const q = query.toLowerCase().trim();
    return details.items.filter(item => {
      return (
        item.title.toLowerCase().includes(q) ||
        item.subtitle.toLowerCase().includes(q) ||
        item.publicationName.toLowerCase().includes(q) ||
        (item.variation && item.variation.toLowerCase().includes(q)) ||
        (item.receta && item.receta.toLowerCase().includes(q)) ||
        (item.componentes_ids && item.componentes_ids.toLowerCase().includes(q))
      );
    });
  } catch (error) {
    console.error("Error en búsqueda:", error);
    return [];
  }
}
