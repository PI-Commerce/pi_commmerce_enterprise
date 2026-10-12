/**
 * Trigger catalog — the inbound entry-point registry.
 *
 * An inbound journey starts from a single Trigger node instead of Start + Audience.
 * This module is the data behind that node's "How does this journey start?" picker:
 * a set of **native connectors** (the platform knows the event schema, so each
 * event's fields auto-map to workflow variables) plus the generic **incoming
 * webhook** path (unknown schema → the merchant test-fires an event and maps fields
 * by hand). It was lifted out of the old standalone `/triggers` prototype so the
 * Trigger node and any future surface share one source of truth.
 *
 * The field shape (`{ varName, from, type }`) mirrors tool-registry's ToolOutput
 * `{ path, varName }` JSONPath→variable contract, so the same mental model and
 * mapper UI applies to connector events, tool outputs, and generic webhooks.
 */
import {
  CreditCard, Package, Users, ShoppingBag, type LucideIcon,
} from "lucide-react";
import type { ToolDataType } from "@/lib/tool-registry";

export type TriggerCategory = "Payments" | "Orders" | "CRM" | "E-commerce";

export type ConnectorEvent = {
  id: string;
  label: string;
  desc: string;
  /** Fields this event always carries — auto-mapped to workflow variables.
   *  Mirrors tool-registry's ToolOutput `{ path, varName }` shape. */
  fields: { varName: string; from: string; type: ToolDataType }[];
};

export type Connector = {
  id: string;
  name: string;
  category: TriggerCategory;
  icon?: LucideIcon;
  logoUrl?: string;
  blurb: string;
  events: ConnectorEvent[];
};

export const CATEGORY_TINT: Record<TriggerCategory, string> = {
  Payments: "text-ai bg-ai/10 border-ai/25",
  Orders: "text-warning bg-warning/10 border-warning/25",
  CRM: "text-success bg-success/10 border-success/25",
  "E-commerce": "text-foreground bg-secondary border-border",
};

export const CATEGORY_ORDER: TriggerCategory[] = ["Payments", "Orders", "CRM", "E-commerce"];

const CONTACT_PHONE = { varName: "contact.phone", type: "String" as ToolDataType };
const CONTACT_NAME = { varName: "contact.name", type: "String" as ToolDataType };

export const CONNECTORS: Connector[] = [
  {
    id: "paytm",
    name: "Paytm Payments",
    category: "Payments",
    logoUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Paytm_Logo_%28standalone%29.svg/250px-Paytm_Logo_%28standalone%29.svg.png",
    blurb: "UPI · cards · netbanking · wallet · subscriptions",
    events: [
      {
        id: "payment.success",
        label: "Payment success",
        desc: "A customer completes a payment",
        fields: [
          { ...CONTACT_PHONE, from: "$.payer.mobile" },
          { ...CONTACT_NAME, from: "$.payer.name" },
          { varName: "payment_id", from: "$.txn.id", type: "String" },
          { varName: "amount", from: "$.txn.amount_paise", type: "Number" },
          { varName: "method", from: "$.txn.method", type: "String" },
        ],
      },
      {
        id: "payment.failed",
        label: "Payment failed",
        desc: "A payment attempt is declined or dropped",
        fields: [
          { ...CONTACT_PHONE, from: "$.payer.mobile" },
          { varName: "payment_id", from: "$.txn.id", type: "String" },
          { varName: "amount", from: "$.txn.amount_paise", type: "Number" },
          { varName: "failure_reason", from: "$.txn.error", type: "String" },
        ],
      },
      {
        id: "refund.completed",
        label: "Refund completed",
        desc: "A refund settles back to the customer",
        fields: [
          { ...CONTACT_PHONE, from: "$.payer.mobile" },
          { varName: "refund_id", from: "$.refund.id", type: "String" },
          { varName: "amount", from: "$.refund.amount_paise", type: "Number" },
        ],
      },
      {
        id: "subscription.charged",
        label: "Subscription charged",
        desc: "A recurring mandate is debited",
        fields: [
          { ...CONTACT_PHONE, from: "$.payer.mobile" },
          { varName: "plan_id", from: "$.subscription.plan", type: "String" },
          { varName: "amount", from: "$.subscription.amount_paise", type: "Number" },
        ],
      },
    ],
  },
  {
    id: "orders",
    name: "Orders",
    category: "Orders",
    icon: Package,
    blurb: "Fulfilment lifecycle · orders.pi",
    events: [
      {
        id: "order.placed",
        label: "Order placed",
        desc: "A new order is created",
        fields: [
          { ...CONTACT_PHONE, from: "$.customer.phone" },
          { ...CONTACT_NAME, from: "$.customer.first_name" },
          { varName: "order_id", from: "$.order.id", type: "String" },
          { varName: "order_total", from: "$.order.total", type: "Number" },
        ],
      },
      {
        id: "order.shipped",
        label: "Order shipped",
        desc: "An order leaves the warehouse",
        fields: [
          { ...CONTACT_PHONE, from: "$.customer.phone" },
          { ...CONTACT_NAME, from: "$.customer.first_name" },
          { varName: "order_id", from: "$.order.id", type: "String" },
          { varName: "tracking_url", from: "$.shipment.tracking_url", type: "String" },
          { varName: "eta", from: "$.shipment.eta", type: "String" },
        ],
      },
      {
        id: "order.delivered",
        label: "Order delivered",
        desc: "An order is marked delivered",
        fields: [
          { ...CONTACT_PHONE, from: "$.customer.phone" },
          { varName: "order_id", from: "$.order.id", type: "String" },
          { varName: "delivered_at", from: "$.shipment.delivered_at", type: "String" },
        ],
      },
      {
        id: "order.cancelled",
        label: "Order cancelled",
        desc: "An order is cancelled by either side",
        fields: [
          { ...CONTACT_PHONE, from: "$.customer.phone" },
          { varName: "order_id", from: "$.order.id", type: "String" },
          { varName: "reason", from: "$.order.cancel_reason", type: "String" },
        ],
      },
      {
        id: "cart.abandoned",
        label: "Cart abandoned",
        desc: "A cart goes idle without checkout",
        fields: [
          { ...CONTACT_PHONE, from: "$.customer.phone" },
          { ...CONTACT_NAME, from: "$.customer.first_name" },
          { varName: "cart_value", from: "$.cart.value", type: "Number" },
          { varName: "item_count", from: "$.cart.items", type: "Number" },
        ],
      },
    ],
  },
  {
    id: "crm",
    name: "CRM",
    category: "CRM",
    icon: Users,
    blurb: "Profile & lifecycle events · crm.pi",
    events: [
      {
        id: "tier.changed",
        label: "Tier changed",
        desc: "A customer moves loyalty tier",
        fields: [
          { ...CONTACT_PHONE, from: "$.customer.phone" },
          { varName: "old_tier", from: "$.change.from", type: "String" },
          { varName: "new_tier", from: "$.change.to", type: "String" },
        ],
      },
      {
        id: "churn_risk.increased",
        label: "Churn risk increased",
        desc: "A customer's churn score crosses a threshold",
        fields: [
          { ...CONTACT_PHONE, from: "$.customer.phone" },
          { ...CONTACT_NAME, from: "$.customer.first_name" },
          { varName: "churn_risk", from: "$.customer.churn_risk", type: "String" },
        ],
      },
      {
        id: "segment.entered",
        label: "Segment entered",
        desc: "A customer enters a behavioural segment",
        fields: [
          { ...CONTACT_PHONE, from: "$.customer.phone" },
          { varName: "segment", from: "$.segment.name", type: "String" },
        ],
      },
    ],
  },
  {
    id: "shopify",
    name: "Shopify",
    category: "E-commerce",
    icon: ShoppingBag,
    blurb: "Orders · carts · customers",
    events: [
      {
        id: "orders/paid",
        label: "Order paid",
        desc: "Shopify order payment captured",
        fields: [
          { ...CONTACT_PHONE, from: "$.customer.phone" },
          { ...CONTACT_NAME, from: "$.customer.first_name" },
          { varName: "order_id", from: "$.id", type: "String" },
          { varName: "order_total", from: "$.total_price", type: "Number" },
        ],
      },
      {
        id: "checkouts/abandoned",
        label: "Checkout abandoned",
        desc: "A checkout is left incomplete",
        fields: [
          { ...CONTACT_PHONE, from: "$.customer.phone" },
          { varName: "recovery_url", from: "$.abandoned_checkout_url", type: "String" },
          { varName: "cart_value", from: "$.total_price", type: "Number" },
        ],
      },
    ],
  },
  {
    id: "razorpay",
    name: "Razorpay",
    category: "Payments",
    icon: CreditCard,
    blurb: "Payments · refunds · subscriptions",
    events: [
      {
        id: "payment.captured",
        label: "Payment captured",
        desc: "A Razorpay payment is captured",
        fields: [
          { ...CONTACT_PHONE, from: "$.payload.payment.entity.contact" },
          { varName: "payment_id", from: "$.payload.payment.entity.id", type: "String" },
          { varName: "amount", from: "$.payload.payment.entity.amount", type: "Number" },
        ],
      },
      {
        id: "payment.failed",
        label: "Payment failed",
        desc: "A Razorpay payment fails",
        fields: [
          { ...CONTACT_PHONE, from: "$.payload.payment.entity.contact" },
          { varName: "amount", from: "$.payload.payment.entity.amount", type: "Number" },
          { varName: "error_code", from: "$.payload.payment.entity.error_code", type: "String" },
        ],
      },
    ],
  },
  {
    id: "woocommerce",
    name: "WooCommerce",
    category: "E-commerce",
    icon: ShoppingBag,
    blurb: "Orders · subscriptions",
    events: [
      {
        id: "order.completed",
        label: "Order completed",
        desc: "A WooCommerce order completes",
        fields: [
          { ...CONTACT_PHONE, from: "$.billing.phone" },
          { ...CONTACT_NAME, from: "$.billing.first_name" },
          { varName: "order_id", from: "$.id", type: "String" },
          { varName: "order_total", from: "$.total", type: "Number" },
        ],
      },
    ],
  },
  {
    id: "zoho",
    name: "Zoho CRM",
    category: "CRM",
    icon: Users,
    blurb: "Leads · contacts · deals",
    events: [
      {
        id: "lead.created",
        label: "Lead created",
        desc: "A new lead lands in Zoho",
        fields: [
          { ...CONTACT_PHONE, from: "$.data.Phone" },
          { ...CONTACT_NAME, from: "$.data.First_Name" },
          { varName: "lead_source", from: "$.data.Lead_Source", type: "String" },
        ],
      },
    ],
  },
];

/** Look up a connector by id. */
export function connectorById(id?: string): Connector | undefined {
  return id ? CONNECTORS.find((c) => c.id === id) : undefined;
}

/** Look up a connector's event by ids. */
export function connectorEvent(connectorId?: string, eventId?: string): ConnectorEvent | undefined {
  return connectorById(connectorId)?.events.find((e) => e.id === eventId);
}
