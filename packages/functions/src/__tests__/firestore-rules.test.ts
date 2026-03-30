import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { resolve } from "path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const TENANT_ID = "tenant-1";
const BRANCH_ID = "branch-1";
const OTHER_TENANT_ID = "tenant-2";

function authUser(role: string, branchIds: string[] = [BRANCH_ID]) {
  return {
    uid: `user-${role}`,
    token: { tenantId: TENANT_ID, role, branchIds },
  };
}

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const rulesPath = resolve(__dirname, "../../../../firebase/firestore.rules");
  const rules = readFileSync(rulesPath, "utf8");

  testEnv = await initializeTestEnvironment({
    projectId: "smartpos-test",
    firestore: { rules },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

// ─── Tenant isolation ────────────────────────────────────────────

describe("tenant isolation", () => {
  it("allows reading own tenant doc", async () => {
    const db = testEnv.authenticatedContext("user-1", {
      tenantId: TENANT_ID,
      role: "super_admin",
      branchIds: [BRANCH_ID],
    }).firestore();

    await assertSucceeds(db.doc(`tenants/${TENANT_ID}`).get());
  });

  it("denies reading other tenant doc", async () => {
    const db = testEnv.authenticatedContext("user-1", {
      tenantId: TENANT_ID,
      role: "super_admin",
      branchIds: [BRANCH_ID],
    }).firestore();

    await assertFails(db.doc(`tenants/${OTHER_TENANT_ID}`).get());
  });

  it("denies unauthenticated access", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.doc(`tenants/${TENANT_ID}`).get());
  });
});

// ─── Admin-only collections ──────────────────────────────────────

describe("admin-only writes", () => {
  it("allows admin to write tenant doc", async () => {
    const db = testEnv.authenticatedContext("admin-1", {
      tenantId: TENANT_ID,
      role: "super_admin",
      branchIds: [BRANCH_ID],
    }).firestore();

    await assertSucceeds(
      db.doc(`tenants/${TENANT_ID}`).set({ name: "Test Tenant" }),
    );
  });

  it("denies cashier from writing tenant doc", async () => {
    const db = testEnv.authenticatedContext("cashier-1", {
      tenantId: TENANT_ID,
      role: "cashier",
      branchIds: [BRANCH_ID],
    }).firestore();

    await assertFails(
      db.doc(`tenants/${TENANT_ID}`).set({ name: "Hacked" }),
    );
  });

  it("allows super_admin to write products", async () => {
    const ctx = testEnv.authenticatedContext("admin-1", {
      tenantId: TENANT_ID,
      role: "super_admin",
      branchIds: [BRANCH_ID],
    });

    await assertSucceeds(
      ctx.firestore().doc(`tenants/${TENANT_ID}/products/prod-1`).set({ name: "Widget", sellingPrice: 999 }),
    );
  });

  it("denies cashier from writing products", async () => {
    const db = testEnv.authenticatedContext("cashier-1", {
      tenantId: TENANT_ID,
      role: "cashier",
      branchIds: [BRANCH_ID],
    }).firestore();

    await assertFails(
      db.doc(`tenants/${TENANT_ID}/products/prod-1`).set({ name: "Widget" }),
    );
  });

  it("allows admin to write categories", async () => {
    const db = testEnv.authenticatedContext("admin-1", {
      tenantId: TENANT_ID,
      role: "super_admin",
      branchIds: [BRANCH_ID],
    }).firestore();

    await assertSucceeds(
      db.doc(`tenants/${TENANT_ID}/categories/cat-1`).set({ name: "Beverages" }),
    );
  });

  it("allows admin to write users", async () => {
    const db = testEnv.authenticatedContext("admin-1", {
      tenantId: TENANT_ID,
      role: "super_admin",
      branchIds: [BRANCH_ID],
    }).firestore();

    await assertSucceeds(
      db.doc(`tenants/${TENANT_ID}/users/user-1`).set({ fullName: "Test User" }),
    );
  });
});

// ─── Cloud Functions-only collections ────────────────────────────

describe("cloud functions-only writes", () => {
  it("denies client writes to transactions", async () => {
    const db = testEnv.authenticatedContext("admin-1", {
      tenantId: TENANT_ID,
      role: "super_admin",
      branchIds: [BRANCH_ID],
    }).firestore();

    await assertFails(
      db.doc(`tenants/${TENANT_ID}/branches/${BRANCH_ID}/transactions/tx-1`).set({ grandTotal: 1000 }),
    );
  });

  it("denies client writes to registers", async () => {
    const db = testEnv.authenticatedContext("admin-1", {
      tenantId: TENANT_ID,
      role: "super_admin",
      branchIds: [BRANCH_ID],
    }).firestore();

    await assertFails(
      db.doc(`tenants/${TENANT_ID}/branches/${BRANCH_ID}/registers/reg-1`).set({ status: "open" }),
    );
  });

  it("denies client writes to stockLevels", async () => {
    const db = testEnv.authenticatedContext("admin-1", {
      tenantId: TENANT_ID,
      role: "super_admin",
      branchIds: [BRANCH_ID],
    }).firestore();

    await assertFails(
      db.doc(`tenants/${TENANT_ID}/branches/${BRANCH_ID}/stockLevels/prod-1`).set({ quantity: 100 }),
    );
  });

  it("denies client writes to auditLog", async () => {
    const db = testEnv.authenticatedContext("admin-1", {
      tenantId: TENANT_ID,
      role: "super_admin",
      branchIds: [BRANCH_ID],
    }).firestore();

    await assertFails(
      db.doc(`tenants/${TENANT_ID}/auditLog/log-1`).set({ action: "test" }),
    );
  });

  it("denies client writes to dailyAggregates", async () => {
    const db = testEnv.authenticatedContext("admin-1", {
      tenantId: TENANT_ID,
      role: "super_admin",
      branchIds: [BRANCH_ID],
    }).firestore();

    await assertFails(
      db.doc(`tenants/${TENANT_ID}/branches/${BRANCH_ID}/dailyAggregates/2026-01-01`).set({ revenue: 10000 }),
    );
  });

  it("denies client writes to cashDrops", async () => {
    const db = testEnv.authenticatedContext("admin-1", {
      tenantId: TENANT_ID,
      role: "super_admin",
      branchIds: [BRANCH_ID],
    }).firestore();

    await assertFails(
      db.doc(`tenants/${TENANT_ID}/branches/${BRANCH_ID}/cashDrops/drop-1`).set({ amount: 5000 }),
    );
  });
});

// ─── Branch access ───────────────────────────────────────────────

describe("branch access control", () => {
  it("allows reading transactions with branch access", async () => {
    const db = testEnv.authenticatedContext("cashier-1", {
      tenantId: TENANT_ID,
      role: "cashier",
      branchIds: [BRANCH_ID],
    }).firestore();

    await assertSucceeds(
      db.doc(`tenants/${TENANT_ID}/branches/${BRANCH_ID}/transactions/tx-1`).get(),
    );
  });

  it("denies reading transactions without branch access", async () => {
    const db = testEnv.authenticatedContext("cashier-1", {
      tenantId: TENANT_ID,
      role: "cashier",
      branchIds: ["other-branch"],
    }).firestore();

    await assertFails(
      db.doc(`tenants/${TENANT_ID}/branches/${BRANCH_ID}/transactions/tx-1`).get(),
    );
  });

  it("allows reading registers with branch access", async () => {
    const db = testEnv.authenticatedContext("cashier-1", {
      tenantId: TENANT_ID,
      role: "cashier",
      branchIds: [BRANCH_ID],
    }).firestore();

    await assertSucceeds(
      db.doc(`tenants/${TENANT_ID}/branches/${BRANCH_ID}/registers/reg-1`).get(),
    );
  });
});

// ─── Held carts ──────────────────────────────────────────────────

describe("held carts", () => {
  it("allows cashier to create held cart in their branch", async () => {
    const db = testEnv.authenticatedContext("cashier-1", {
      tenantId: TENANT_ID,
      role: "cashier",
      branchIds: [BRANCH_ID],
    }).firestore();

    await assertSucceeds(
      db.doc(`tenants/${TENANT_ID}/branches/${BRANCH_ID}/heldCarts/cart-1`).set({
        items: [],
        heldBy: "cashier-1",
      }),
    );
  });

  it("denies creating held cart without branch access", async () => {
    const db = testEnv.authenticatedContext("cashier-1", {
      tenantId: TENANT_ID,
      role: "cashier",
      branchIds: ["other-branch"],
    }).firestore();

    await assertFails(
      db.doc(`tenants/${TENANT_ID}/branches/${BRANCH_ID}/heldCarts/cart-1`).set({
        items: [],
        heldBy: "cashier-1",
      }),
    );
  });
});

// ─── Pending transactions ────────────────────────────────────────

describe("pending transactions (offline queue)", () => {
  it("allows cashier to create pending transaction", async () => {
    const db = testEnv.authenticatedContext("cashier-1", {
      tenantId: TENANT_ID,
      role: "cashier",
      branchIds: [BRANCH_ID],
    }).firestore();

    await assertSucceeds(
      db.doc(`tenants/${TENANT_ID}/branches/${BRANCH_ID}/pendingTransactions/ptx-1`).set({
        items: [],
        grandTotal: 1000,
      }),
    );
  });

  it("denies updating pending transaction", async () => {
    const db = testEnv.authenticatedContext("cashier-1", {
      tenantId: TENANT_ID,
      role: "cashier",
      branchIds: [BRANCH_ID],
    }).firestore();

    // Use admin context to seed data first
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore()
        .doc(`tenants/${TENANT_ID}/branches/${BRANCH_ID}/pendingTransactions/ptx-2`)
        .set({ items: [], grandTotal: 500 });
    });

    await assertFails(
      db.doc(`tenants/${TENANT_ID}/branches/${BRANCH_ID}/pendingTransactions/ptx-2`).update({
        grandTotal: 9999,
      }),
    );
  });
});

// ─── Customers ───────────────────────────────────────────────────

describe("customers", () => {
  it("allows any authenticated tenant user to create customers", async () => {
    const db = testEnv.authenticatedContext("cashier-1", {
      tenantId: TENANT_ID,
      role: "cashier",
      branchIds: [BRANCH_ID],
    }).firestore();

    await assertSucceeds(
      db.doc(`tenants/${TENANT_ID}/customers/cust-1`).set({ fullName: "Jane Doe" }),
    );
  });

  it("denies cashier from deleting customers", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore()
        .doc(`tenants/${TENANT_ID}/customers/cust-2`)
        .set({ fullName: "To Delete" });
    });

    const db = testEnv.authenticatedContext("cashier-1", {
      tenantId: TENANT_ID,
      role: "cashier",
      branchIds: [BRANCH_ID],
    }).firestore();

    await assertFails(
      db.doc(`tenants/${TENANT_ID}/customers/cust-2`).delete(),
    );
  });

  it("allows admin to delete customers", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore()
        .doc(`tenants/${TENANT_ID}/customers/cust-3`)
        .set({ fullName: "To Delete" });
    });

    const db = testEnv.authenticatedContext("admin-1", {
      tenantId: TENANT_ID,
      role: "super_admin",
      branchIds: [BRANCH_ID],
    }).firestore();

    await assertSucceeds(
      db.doc(`tenants/${TENANT_ID}/customers/cust-3`).delete(),
    );
  });
});

// ─── Suppliers (manager+) ────────────────────────────────────────

describe("suppliers", () => {
  it("allows manager to write suppliers", async () => {
    const db = testEnv.authenticatedContext("manager-1", {
      tenantId: TENANT_ID,
      role: "branch_manager",
      branchIds: [BRANCH_ID],
    }).firestore();

    await assertSucceeds(
      db.doc(`tenants/${TENANT_ID}/suppliers/sup-1`).set({ name: "Acme Corp" }),
    );
  });

  it("denies cashier from writing suppliers", async () => {
    const db = testEnv.authenticatedContext("cashier-1", {
      tenantId: TENANT_ID,
      role: "cashier",
      branchIds: [BRANCH_ID],
    }).firestore();

    await assertFails(
      db.doc(`tenants/${TENANT_ID}/suppliers/sup-1`).set({ name: "Hacked" }),
    );
  });
});

// ─── Audit log ───────────────────────────────────────────────────

describe("audit log", () => {
  it("allows manager to read audit log", async () => {
    const db = testEnv.authenticatedContext("manager-1", {
      tenantId: TENANT_ID,
      role: "branch_manager",
      branchIds: [BRANCH_ID],
    }).firestore();

    await assertSucceeds(
      db.doc(`tenants/${TENANT_ID}/auditLog/log-1`).get(),
    );
  });

  it("denies cashier from reading audit log", async () => {
    const db = testEnv.authenticatedContext("cashier-1", {
      tenantId: TENANT_ID,
      role: "cashier",
      branchIds: [BRANCH_ID],
    }).firestore();

    await assertFails(
      db.doc(`tenants/${TENANT_ID}/auditLog/log-1`).get(),
    );
  });
});
