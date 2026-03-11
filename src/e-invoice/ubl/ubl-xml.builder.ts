import { v4 as uuidv4 } from 'uuid';

export interface UblInvoiceLine {
  lineNo: number;
  description: string;
  quantity: number;
  unitCode: string;        // örn. 'C62' (adet), 'KGM' (kg)
  unitPrice: number;
  taxPercent: number;
  lineExtensionAmount: number;
  taxAmount: number;
}

export interface UblInvoiceData {
  uuid: string;            // RFC 4122 v4 UUID
  documentNo: string;      // örn. 'GBS2026000000001'
  issueDate: string;       // YYYY-MM-DD
  issueTime: string;       // HH:mm:ss
  invoiceTypeCode: 'SATIS' | 'IADE'; // GİB fatura tipi
  currency: string;        // ISO 4217: 'TRY'

  issuerVkn: string;
  issuerName: string;
  issuerCity?: string;
  issuerCountry?: string;

  receiverVkn?: string;
  receiverTckn?: string;
  receiverName: string;
  receiverCity?: string;
  receiverCountry?: string;

  lines: UblInvoiceLine[];
  taxExclusiveAmount: number;
  taxInclusiveAmount: number;
  taxTotalAmount: number;
}

/**
 * Türkiye GİB e-Fatura/e-Arşiv için UBL 2.1 XML üretici.
 *
 * Üretilen XML GİB teknik kılavuzundaki zorunlu alanları içerir.
 *
 * ÖNEMLİ: Üretilen XML imzasızdır. Gerçek gönderimde XAdES-BES imzası
 * bir HSM veya nitelikli e-imza sağlayıcısı aracılığıyla uygulanmalıdır.
 * Bkz. `GibProvider.sign()` metodu.
 */
export class UblXmlBuilder {
  build(data: UblInvoiceData): string {
    const lines = data.lines.map((l) => this.buildInvoiceLine(l, data.currency)).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent>
        <!-- XAdES-BES imzası buraya eklenir (HSM / e-imza sağlayıcısı tarafından) -->
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>TEMELFATURA</cbc:ProfileID>
  <cbc:ID>${this.esc(data.documentNo)}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID>${this.esc(data.uuid)}</cbc:UUID>
  <cbc:IssueDate>${this.esc(data.issueDate)}</cbc:IssueDate>
  <cbc:IssueTime>${this.esc(data.issueTime)}</cbc:IssueTime>
  <cbc:InvoiceTypeCode>${this.esc(data.invoiceTypeCode)}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${this.esc(data.currency)}</cbc:DocumentCurrencyCode>
  <cbc:LineCountNumeric>${data.lines.length}</cbc:LineCountNumeric>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="VKN">${this.esc(data.issuerVkn)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${this.esc(data.issuerName)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:CityName>${this.esc(data.issuerCity ?? '')}</cbc:CityName>
        <cac:Country>
          <cbc:Name>${this.esc(data.issuerCountry ?? 'Türkiye')}</cbc:Name>
        </cac:Country>
      </cac:PostalAddress>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      ${data.receiverVkn
        ? `<cac:PartyIdentification><cbc:ID schemeID="VKN">${this.esc(data.receiverVkn)}</cbc:ID></cac:PartyIdentification>`
        : data.receiverTckn
          ? `<cac:PartyIdentification><cbc:ID schemeID="TCKN">${this.esc(data.receiverTckn)}</cbc:ID></cac:PartyIdentification>`
          : ''}
      <cac:PartyName>
        <cbc:Name>${this.esc(data.receiverName)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:CityName>${this.esc(data.receiverCity ?? '')}</cbc:CityName>
        <cac:Country>
          <cbc:Name>${this.esc(data.receiverCountry ?? 'Türkiye')}</cbc:Name>
        </cac:Country>
      </cac:PostalAddress>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${this.esc(data.currency)}">${data.taxTotalAmount.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${this.esc(data.currency)}">${data.taxExclusiveAmount.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${this.esc(data.currency)}">${data.taxTotalAmount.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cac:TaxScheme>
          <cbc:Name>KDV</cbc:Name>
          <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${this.esc(data.currency)}">${data.taxExclusiveAmount.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${this.esc(data.currency)}">${data.taxExclusiveAmount.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${this.esc(data.currency)}">${data.taxInclusiveAmount.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${this.esc(data.currency)}">${data.taxInclusiveAmount.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${lines}
</Invoice>`;
  }

  private buildInvoiceLine(line: UblInvoiceLine, currency: string): string {
    return `  <cac:InvoiceLine>
    <cbc:ID>${line.lineNo}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${this.esc(line.unitCode)}">${line.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${this.esc(currency)}">${line.lineExtensionAmount.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${this.esc(currency)}">${line.taxAmount.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${this.esc(currency)}">${line.lineExtensionAmount.toFixed(2)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${this.esc(currency)}">${line.taxAmount.toFixed(2)}</cbc:TaxAmount>
        <cbc:Percent>${line.taxPercent}</cbc:Percent>
        <cac:TaxCategory>
          <cac:TaxScheme>
            <cbc:Name>KDV</cbc:Name>
            <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Description>${this.esc(line.description)}</cbc:Description>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${this.esc(currency)}">${line.unitPrice.toFixed(4)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
  }

  /** XML özel karakterlerini escape eder */
  private esc(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
