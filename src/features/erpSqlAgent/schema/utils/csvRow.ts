import { normalizeText, parseBoolean } from "./keyword.js";
import type { SchemaFieldImportInput, SchemaTableImportInput } from "../types/schemaTypes.js";

export type CsvRow = Record<string, string | undefined>;

/** Returns the first non-empty CSV value from a set of possible header names. */
export function pickCsvValue(row: CsvRow, keys: string[]): string | null {
  for (const key of keys) {
    const value = normalizeText(row[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

/** Maps a ZDataTable CSV row into a normalized table import payload. */
export function mapZDataTableRow(row: CsvRow): SchemaTableImportInput | null {
  const schemaName = pickCsvValue(row, ["SchemaName", "Schema", "DBSchemaName", "Namespace"]) ?? "Erp";
  const tableName = pickCsvValue(row, ["DBTableName", "TableName", "DataTableName", "DataTableID", "Name"]);
  if (!tableName) {
    return null;
  }

  return {
    schemaName,
    tableName,
    description: pickCsvValue(row, ["Description", "TableDescription", "HelpText"]),
    tableLabel: pickCsvValue(row, ["TableLabel", "Label", "DisplayName"]),
    systemCode: pickCsvValue(row, ["SystemCode", "SystemCodeID", "System"]),
    tableType: pickCsvValue(row, ["TableType", "Type"]),
    dataTableId: pickCsvValue(row, ["DataTableID", "DataTableId", "SysRowID", "ID"]),
  };
}

/** Maps a ZDataField CSV row into a normalized field import payload. */
export function mapZDataFieldRow(row: CsvRow): SchemaFieldImportInput | null {
  const schemaName = pickCsvValue(row, ["SchemaName", "Schema", "DBSchemaName", "Namespace"]) ?? "Erp";
  const tableName = pickCsvValue(row, ["DBTableName", "TableName", "DataTableName", "DataTableID"]);
  const fieldName = pickCsvValue(row, ["FieldName", "DataFieldName", "Name"]);
  if (!tableName || !fieldName) {
    return null;
  }

  return {
    schemaName,
    tableName,
    fieldName,
    dbFieldName: pickCsvValue(row, ["DBFieldName", "DbFieldName", "ColumnName"]),
    fieldLabel: pickCsvValue(row, ["FieldLabel", "Label", "DisplayName"]),
    description: pickCsvValue(row, ["Description", "FieldDescription", "HelpText"]),
    dataType: pickCsvValue(row, ["DataType", "FieldDataType", "DbDataType"]),
    required: parseBoolean(pickCsvValue(row, ["Required", "IsRequired"])),
    readOnly: parseBoolean(pickCsvValue(row, ["ReadOnly", "IsReadOnly"])),
    useDbDefault: parseBoolean(pickCsvValue(row, ["UseDBDefault", "UseDbDefault"])),
    tooltipText: pickCsvValue(row, ["TooltipText", "ToolTipText", "Tooltip"]),
    isDescriptionField: parseBoolean(pickCsvValue(row, ["IsDescriptionField", "DescriptionField"])),
    likeDataFieldName: pickCsvValue(row, ["LikeDataFieldName", "LikeFieldName"]),
  };
}
