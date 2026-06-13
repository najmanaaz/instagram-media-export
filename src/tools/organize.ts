import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SortMediaInputSchema, PreviewGroupsInputSchema } from "../schemas/organize.js";
import { MONTH_NAMES } from "../constants.js";
import type { MediaItem, AlbumGroup } from "../types.js";

function computeDateRange(
  items: MediaItem[]
): { start: string; end: string } | undefined {
  const timestamps = items
    .filter((i) => i.timestamp)
    .map((i) => new Date(i.timestamp!).getTime())
    .sort((a, b) => a - b);
  if (timestamps.length === 0) return undefined;
  return {
    start: new Date(timestamps[0]).toISOString(),
    end: new Date(timestamps[timestamps.length - 1]).toISOString(),
  };
}

function groupByMonth(items: MediaItem[]): AlbumGroup[] {
  const groups = new Map<string, MediaItem[]>();
  for (const item of items) {
    let key = "Unknown Date";
    if (item.timestamp) {
      const d = new Date(item.timestamp);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      key = `${year}-${month} ${MONTH_NAMES[d.getMonth()]}`;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return [...groups.entries()].map(([name, groupItems]) => ({
    name,
    criteria: `month:${name}`,
    items: groupItems,
    dateRange: computeDateRange(groupItems),
    itemCount: groupItems.length,
  }));
}

function groupByYear(items: MediaItem[]): AlbumGroup[] {
  const groups = new Map<string, MediaItem[]>();
  for (const item of items) {
    let key = "Unknown Date";
    if (item.timestamp) {
      key = String(new Date(item.timestamp).getFullYear());
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return [...groups.entries()].map(([name, groupItems]) => ({
    name,
    criteria: `year:${name}`,
    items: groupItems,
    dateRange: computeDateRange(groupItems),
    itemCount: groupItems.length,
  }));
}

function groupByLocation(items: MediaItem[]): AlbumGroup[] {
  const groups = new Map<string, MediaItem[]>();
  for (const item of items) {
    const key = item.location || "No Location";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return [...groups.entries()].map(([name, groupItems]) => ({
    name,
    criteria: `location:${name}`,
    items: groupItems,
    dateRange: computeDateRange(groupItems),
    itemCount: groupItems.length,
  }));
}

function groupByType(items: MediaItem[]): AlbumGroup[] {
  const groups = new Map<string, MediaItem[]>();
  for (const item of items) {
    const key = item.type === "image" ? "Images" : "Videos";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }
  return [...groups.entries()].map(([name, groupItems]) => ({
    name,
    criteria: `type:${name.toLowerCase()}`,
    items: groupItems,
    dateRange: computeDateRange(groupItems),
    itemCount: groupItems.length,
  }));
}

function groupByCaptionKeyword(
  items: MediaItem[],
  keyword: string
): AlbumGroup[] {
  const matching: MediaItem[] = [];
  const nonMatching: MediaItem[] = [];
  const lowerKeyword = keyword.toLowerCase();
  for (const item of items) {
    if (item.caption && item.caption.toLowerCase().includes(lowerKeyword)) {
      matching.push(item);
    } else {
      nonMatching.push(item);
    }
  }
  const groups: AlbumGroup[] = [];
  if (matching.length > 0) {
    groups.push({
      name: `Contains "${keyword}"`,
      criteria: `caption_keyword:${keyword}`,
      items: matching,
      dateRange: computeDateRange(matching),
      itemCount: matching.length,
    });
  }
  if (nonMatching.length > 0) {
    groups.push({
      name: "Other",
      criteria: `caption_keyword:!${keyword}`,
      items: nonMatching,
      dateRange: computeDateRange(nonMatching),
      itemCount: nonMatching.length,
    });
  }
  return groups;
}

export function registerOrganizeTools(server: McpServer): void {
  server.tool(
    "sort_media",
    "Group media items into album groups by month, year, location, type, or caption keyword",
    SortMediaInputSchema.shape,
    async ({ items, groupBy, keyword }) => {
      let groups: AlbumGroup[];
      switch (groupBy) {
        case "month":
          groups = groupByMonth(items);
          break;
        case "year":
          groups = groupByYear(items);
          break;
        case "location":
          groups = groupByLocation(items);
          break;
        case "type":
          groups = groupByType(items);
          break;
        case "caption_keyword":
          if (!keyword) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({
                    error: "keyword is required when groupBy is caption_keyword",
                  }),
                },
              ],
              isError: true,
            };
          }
          groups = groupByCaptionKeyword(items, keyword);
          break;
        default:
          groups = [];
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ groups }, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "preview_groups",
    "Generate a human-readable summary of album groups with counts, date ranges, and sample captions",
    PreviewGroupsInputSchema.shape,
    async ({ groups }) => {
      const lines: string[] = [
        "Album Group Summary",
        "=".repeat(60),
        "",
      ];

      for (const group of groups) {
        lines.push(`## ${group.name}`);
        lines.push(`   Items: ${group.itemCount}`);
        lines.push(`   Criteria: ${group.criteria}`);
        if (group.dateRange) {
          const start = new Date(group.dateRange.start).toLocaleDateString();
          const end = new Date(group.dateRange.end).toLocaleDateString();
          lines.push(`   Date Range: ${start} — ${end}`);
        }
        // Sample captions
        const captions = group.items
          .filter((i) => i.caption)
          .slice(0, 3)
          .map((i) => i.caption!);
        if (captions.length > 0) {
          lines.push(`   Sample Captions:`);
          for (const cap of captions) {
            const truncated =
              cap.length > 80 ? cap.substring(0, 80) + "..." : cap;
            lines.push(`     - "${truncated}"`);
          }
        }
        lines.push("");
      }

      lines.push(`Total Groups: ${groups.length}`);
      const totalItems = groups.reduce((sum, g) => sum + g.itemCount, 0);
      lines.push(`Total Items: ${totalItems}`);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ summary: lines.join("\n") }),
          },
        ],
      };
    }
  );
}
