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
import { useCallback, useState } from "react";
import { listCustomers, parseCustomerSort } from "../crm/queries.server";
import { authenticate } from "../shopify.server";

// Heading positions the two sortable columns occupy in `headings` below.
const LIFETIME_VALUE_COLUMN = 2;
const LAST_ACTIVITY_COLUMN = 4;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const params = new URL(request.url).searchParams;
  const search = params.get("q") ?? "";
  const sort = parseCustomerSort(params.get("sort"), params.get("dir"));
  return json({ search, sort, customers: await listCustomers(search, sort) });
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
  const { customers, search, sort } = useLoaderData<typeof loader>();
  const [, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // The input is driven by local state, not by loader data. Bound to the
  // loader it could only change once a server round-trip resolved, so every
  // keystroke would be reset to the old value until then.
  const [query, setQuery] = useState(search);

  // The functional form preserves the rest of the query string. In the
  // embedded admin that string carries Shopify's own params (host, shop,
  // embedded, id_token…), and replacing it wholesale drops them. `replace`
  // keeps a five-letter search from pushing five history entries.
  const onSearch = useCallback(
    (value: string) => {
      setQuery(value);
      setSearchParams(
        (prev) => {
          if (value) prev.set("q", value);
          else prev.delete("q");
          return prev;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const onSort = useCallback(
    (headingIndex: number, direction: "ascending" | "descending") => {
      setSearchParams((prev) => {
        prev.set(
          "sort",
          headingIndex === LIFETIME_VALUE_COLUMN
            ? "lifetimeValue"
            : "lastActivity",
        );
        prev.set("dir", direction === "ascending" ? "asc" : "desc");
        return prev;
      });
    },
    [setSearchParams],
  );

  return (
    <Page title="Customers">
      <Card padding="0">
        <div style={{ padding: "12px" }}>
          <TextField
            label="Search customers"
            labelHidden
            value={query}
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
          sortable={[false, false, true, false, true]}
          sortColumnIndex={
            sort.key === "lifetimeValue"
              ? LIFETIME_VALUE_COLUMN
              : LAST_ACTIVITY_COLUMN
          }
          sortDirection={sort.direction === "asc" ? "ascending" : "descending"}
          sortToggleLabels={{
            [LIFETIME_VALUE_COLUMN]: {
              ascending: "Lowest lifetime value first",
              descending: "Highest lifetime value first",
            },
            [LAST_ACTIVITY_COLUMN]: {
              ascending: "Least recently active first",
              descending: "Most recently active first",
            },
          }}
          onSort={onSort}
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
