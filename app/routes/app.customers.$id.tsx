import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Card,
  EmptyState,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import { Timeline } from "../components/Timeline";
import { getCustomerDetail } from "../crm/queries.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const detail = await getCustomerDetail(params.id!);
  return json({ detail });
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <InlineStack align="space-between">
      <Text as="span" tone="subdued">
        {label}
      </Text>
      <Text as="span" fontWeight="semibold">
        {value}
      </Text>
    </InlineStack>
  );
}

export default function CustomerDetail() {
  const { detail } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  if (!detail) {
    return (
      <Page title="Customer not found">
        <Card>
          <EmptyState
            heading="We couldn't find that customer"
            action={{
              content: "Back to customers",
              onAction: () => navigate("/app/customers"),
            }}
            image="https://cdn.shopify.com/s/files/1/0757/9955/files/empty-state.svg"
          >
            <p>The customer may have been removed, or the link is wrong.</p>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  const { customer, stats, timeline } = detail;

  return (
    <Page
      title={`${customer.firstName} ${customer.lastName}`}
      backAction={{ content: "Customers", onAction: () => navigate("/app/customers") }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">
                Timeline
              </Text>
              <Timeline events={timeline} />
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm">
                  Customer
                </Text>
                <Text as="p">{customer.email}</Text>
                {customer.phone ? <Text as="p">{customer.phone}</Text> : null}
                <Text as="p">
                  {customer.city}, {customer.region}
                </Text>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm">
                  Value
                </Text>
                <Stat label="Lifetime" value={money(stats.lifetimeValueCents)} />
                <Stat label="Orders" value={String(stats.orderCount)} />
                <Stat
                  label="Avg order"
                  value={money(stats.averageOrderValueCents)}
                />
                <Stat
                  label="Customer since"
                  value={new Date(customer.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })}
                />
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingSm">
                  Consent
                </Text>
                <InlineGrid>
                  <Badge tone={customer.marketingConsent ? "success" : undefined}>
                    {customer.marketingConsent ? "Subscribed" : "Not subscribed"}
                  </Badge>
                </InlineGrid>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
