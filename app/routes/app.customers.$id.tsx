import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigate, useNavigation } from "@remix-run/react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  EmptyState,
  InlineError,
  InlineGrid,
  InlineStack,
  Layout,
  Page,
  Select,
  Text,
  TextField,
} from "@shopify/polaris";
import { useState } from "react";
import { Timeline } from "../components/Timeline";
import { logInteraction, validateInteraction } from "../crm/interactions.server";
import { getCustomerDetail } from "../crm/queries.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const detail = await getCustomerDetail(params.id!);
  return json({ detail });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  await authenticate.admin(request);

  const form = await request.formData();
  const result = validateInteraction({
    type: String(form.get("type") ?? ""),
    body: String(form.get("body") ?? ""),
  });

  if (!result.ok) {
    return json({ error: result.error }, { status: 400 });
  }

  await logInteraction(params.id!, result.value);
  return json({ error: null });
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
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submitting = navigation.state === "submitting";
  const [type, setType] = useState("call");
  const [body, setBody] = useState("");

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
          {/* Layout.Section puts no gap between its children, so sibling Cards
              would render flush. The sidebar section below does the same. */}
          <BlockStack gap="400">
            <Card>
              <Form method="post" onSubmit={() => setBody("")}>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingSm">
                    Log an interaction
                  </Text>
                  <InlineStack gap="200" blockAlign="end" wrap={false}>
                    <div style={{ width: 140 }}>
                      <Select
                        label="Type"
                        labelHidden
                        name="type"
                        value={type}
                        onChange={setType}
                        options={[
                          { label: "Call", value: "call" },
                          { label: "Email", value: "email" },
                          { label: "DM", value: "dm" },
                          { label: "Note", value: "note" },
                        ]}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <TextField
                        label="What happened?"
                        labelHidden
                        name="body"
                        value={body}
                        onChange={setBody}
                        placeholder="What happened?"
                        autoComplete="off"
                        maxLength={2000}
                      />
                    </div>
                    <Button submit variant="primary" loading={submitting}>
                      Log it
                    </Button>
                  </InlineStack>
                  {actionData?.error ? (
                    <InlineError message={actionData.error} fieldID="body" />
                  ) : null}
                </BlockStack>
              </Form>
            </Card>

            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingSm">
                  Timeline
                </Text>
                <Timeline events={timeline} />
              </BlockStack>
            </Card>
          </BlockStack>
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
