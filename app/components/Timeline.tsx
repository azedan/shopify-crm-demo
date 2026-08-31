import { BlockStack, Box, InlineStack, Text } from "@shopify/polaris";
import type { TimelineEvent } from "../crm/types";

function when(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type SerializedEvent = Omit<TimelineEvent, "timestamp"> & { timestamp: string };

export function Timeline({ events }: { events: SerializedEvent[] }) {
  if (events.length === 0) {
    return (
      <Text as="p" tone="subdued">
        Nothing has happened with this customer yet.
      </Text>
    );
  }

  return (
    <BlockStack gap="0">
      {events.map((event) => (
        <Box
          key={event.id}
          paddingBlock="300"
          borderBlockEndWidth="025"
          borderColor="border-secondary"
        >
          <InlineStack gap="300" align="start" blockAlign="start" wrap={false}>
            <Box paddingBlockStart="150">
              <span
                aria-hidden
                style={{
                  display: "block",
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  border: "2px solid currentColor",
                  background:
                    event.source === "shopify" ? "currentColor" : "transparent",
                  opacity: 0.7,
                }}
              />
            </Box>
            <BlockStack gap="050">
              <Text as="span" fontWeight="semibold">
                {event.title}
              </Text>
              {event.detail ? (
                <Text as="span" tone="subdued" variant="bodySm">
                  {event.detail}
                </Text>
              ) : null}
            </BlockStack>
            <Box width="100%">
              <InlineStack align="end">
                <Text as="span" tone="subdued" variant="bodySm">
                  {when(event.timestamp)}
                </Text>
              </InlineStack>
            </Box>
          </InlineStack>
        </Box>
      ))}
    </BlockStack>
  );
}
