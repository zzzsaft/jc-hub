// src/types/address-parse.d.ts
declare module "address-parse" {
  interface ParseResult {
    province?: string;
    city?: string;
    area?: string;
    details?: string;
    name?: string;
    code?: string;
    __type?: string;
    __parse: number;
    mobile?: string;
    zip_code?: string;
    phone?: string;
  }

  export function parse(address: string): [ParseResult];
  export function parse(
    address: string,
    parseAll: boolean
  ): [ParseResult, ...ParseResult[]];
  export interface AreaData {
    code: string;
    province: string;
    city: string;
    area: string;
    name: string;
    __parse: number;
  }

  export const AREA: {
    province_list: Record<string, string>;
    city_list: Record<string, string>;
    area_list: Record<string, string>;
  };

  export const Utils: {
    getAreaByCode: (code: string) => AreaData;
    getTargetAreaListByCode: (
      type: "province" | "city" | "area",
      code: string,
      withParent?: boolean
    ) => AreaData[];
    getAreaByAddress: (address: Partial<AreaData>) => AreaData;
    Reg: {
      mobile: RegExp;
      phone: RegExp;
      zipCode: RegExp;
    };
  };
}
