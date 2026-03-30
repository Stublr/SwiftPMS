import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { usePropertyStore } from "@/stores/property.store";

function getPath() {
  const { tenantId, propertyId } = usePropertyStore.getState();
  return { tenantId: tenantId!, propertyId: propertyId! };
}

export async function getDailyAggregates(startDate: string, endDate: string) {
  const { tenantId, propertyId } = getPath();
  const snap = await getDocs(
    query(
      collection(db, `tenants/${tenantId}/properties/${propertyId}/dailyAggregates`),
      where("date", ">=", startDate),
      where("date", "<=", endDate),
      orderBy("date", "asc"),
    ),
  );
  return snap.docs.map((d) => ({ date: d.id, ...d.data() }));
}
