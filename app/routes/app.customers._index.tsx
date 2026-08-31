import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import {
  Card,
  IndexTable,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { useCallback } from "react";
import { listCustomers } from "../crm/queries.server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const search = new URL(request.url).searchParams.get("q") ?? "";
  return json({ search, customers: await listCustomers(search) });
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function relative(iso: string | null) {
  if (!iso) return "—";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

export default function CustomerList() {
  const { customers, search } = useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const onSearch = useCallback(
    (value: string) => setSearchParams(value ? { q: value } : {}),
    [setSearchParams],
  );

  return (
    <Page title="Customers">
      <Card padding="0">
        <div style={{ padding: "12px" }}>
          <TextField
            label="Search customers"
            labelHidden
            value={search}
            onChange={onSearch}
            placeholder="Search by name or email"
            autoComplete="off"
            clearButton
            onClearButtonClick={() => onSearch("")}
          />
        </div>
        <IndexTable
          resourceName={{ singular: "customer", plural: "customers" }}
          itemCount={customers.length}
          selectable={false}
          headings={[
            { title: "Name" },
            { title: "Email" },
            { title: "Lifetime value" },
            { title: "Orders" },
            { title: "Last activity" },
          ]}
        >
          {customers.map((c, index) => (
            <IndexTable.Row
              id={c.id}
              key={c.id}
              position={index}
              onClick={() => navigate(`/app/customers/${c.id}`)}
            >
              <IndexTable.Cell>
                <Text as="span" fontWeight="semibold">
                  {c.firstName} {c.lastName}
                </Text>
              </IndexTable.Cell>
              <IndexTable.Cell>{c.email}</IndexTable.Cell>
              <IndexTable.Cell>{money(c.lifetimeValueCents)}</IndexTable.Cell>
              <IndexTable.Cell>{c.orderCount}</IndexTable.Cell>
              <IndexTable.Cell>{relative(c.lastActivityAt)}</IndexTable.Cell>
            </IndexTable.Row>
          ))}
        </IndexTable>
      </Card>
    </Page>
  );
}
