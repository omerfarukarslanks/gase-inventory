import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface GibSubmitResult {
  success: boolean;
  /** GİB referans numarası (başarılı gönderimde döner) */
  referenceNo?: string;
  /** Ham GİB yanıtı */
  rawResponse?: string;
  errorMessage?: string;
}

export interface GibQueryResult {
  status: 'ACCEPTED' | 'REJECTED' | 'PENDING' | 'NOT_FOUND';
  details?: string;
}

/**
 * GİB e-Fatura / e-Arşiv API sağlayıcısı.
 *
 * Ortam değişkenleri:
 *   GIB_BASE_URL        — GİB servis adresi (test veya prod)
 *   GIB_USERNAME        — Kullanıcı adı (VKN veya özel kullanıcı)
 *   GIB_PASSWORD        — Şifre
 *   GIB_INTEGRATION_KEY — Entegratör anahtarı (bazı entegratör API'leri gerektirir)
 *
 * Gerçek entegrasyon:
 *   GİB'in doğrudan SOAP/REST API'si yerine çoğunlukla Edm, Mikro gibi
 *   onaylı özel entegratör servisleri kullanılır. Bu provider her iki
 *   yaklaşıma uyum sağlayacak şekilde tasarlanmıştır.
 *
 * XML İmzalama:
 *   Gönderimden önce `signXml()` metodu çağrılmalıdır. Gerçek XAdES-BES
 *   imzalama bir HSM veya nitelikli e-imza sağlayıcısı gerektirdiğinden,
 *   bu metodun implementasyonu provider kullanıcısına bırakılmıştır.
 */
@Injectable()
export class GibProvider {
  private readonly logger = new Logger(GibProvider.name);

  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;

  constructor(private readonly http: HttpService) {
    this.baseUrl  = process.env.GIB_BASE_URL  ?? 'https://efaturawstest.efatura.gov.tr';
    this.username = process.env.GIB_USERNAME  ?? '';
    this.password = process.env.GIB_PASSWORD  ?? '';
  }

  /**
   * İmzalanmış UBL XML'i GİB'e iletir.
   *
   * Gerçek entegrasyonda bu metod GİB SOAP/REST endpoint'ine
   * Basic Auth veya token ile istek atar.
   *
   * Şu an için yapısal stub — ortam değişkenleri yapılandırıldığında
   * gerçek HTTP çağrısına geçilecektir.
   */
  async submit(signedXml: string, uuid: string): Promise<GibSubmitResult> {
    if (!this.username || !this.password) {
      this.logger.warn('GİB kimlik bilgileri yapılandırılmamış — gönderim simüle ediliyor.');
      return {
        success: true,
        referenceNo: `SIM-${uuid.slice(0, 8).toUpperCase()}`,
        rawResponse: 'SIMULATED',
      };
    }

    try {
      const response = await firstValueFrom(
        this.http.post(
          `${this.baseUrl}/efatura/send`,
          { uuid, xml: Buffer.from(signedXml).toString('base64') },
          {
            auth: { username: this.username, password: this.password },
            headers: { 'Content-Type': 'application/json' },
            timeout: 30_000,
          },
        ),
      );

      const body = response.data as any;
      return {
        success: body?.status === 'ACCEPTED' || response.status === 200,
        referenceNo: body?.referenceNo,
        rawResponse: JSON.stringify(body),
      };
    } catch (err: any) {
      this.logger.error(`GİB submit hatası [uuid=${uuid}]: ${err?.message}`);
      return {
        success: false,
        rawResponse: err?.response?.data ? JSON.stringify(err.response.data) : undefined,
        errorMessage: err?.message,
      };
    }
  }

  /**
   * GİB'de UUID ile fatura durumunu sorgular.
   */
  async query(uuid: string): Promise<GibQueryResult> {
    if (!this.username || !this.password) {
      this.logger.warn('GİB kimlik bilgileri yapılandırılmamış — sorgu simüle ediliyor.');
      return { status: 'ACCEPTED', details: 'SIMULATED' };
    }

    try {
      const response = await firstValueFrom(
        this.http.get(
          `${this.baseUrl}/efatura/status/${uuid}`,
          {
            auth: { username: this.username, password: this.password },
            timeout: 15_000,
          },
        ),
      );

      const body = response.data as any;
      const status = body?.status?.toUpperCase() ?? 'PENDING';
      return { status, details: JSON.stringify(body) };
    } catch (err: any) {
      this.logger.error(`GİB query hatası [uuid=${uuid}]: ${err?.message}`);
      return { status: 'PENDING', details: err?.message };
    }
  }

  /**
   * İptal talebi GİB'e iletir.
   * e-Arşiv için: iptal belgesi gönderilir.
   * e-Fatura için: alıcının ret etmesi veya mutabakat gerekir.
   */
  async cancel(uuid: string, reason: string): Promise<GibSubmitResult> {
    if (!this.username || !this.password) {
      this.logger.warn('GİB kimlik bilgileri yapılandırılmamış — iptal simüle ediliyor.');
      return { success: true, rawResponse: 'SIMULATED' };
    }

    try {
      const response = await firstValueFrom(
        this.http.post(
          `${this.baseUrl}/efatura/cancel`,
          { uuid, reason },
          {
            auth: { username: this.username, password: this.password },
            timeout: 15_000,
          },
        ),
      );

      const body = response.data as any;
      return {
        success: response.status === 200,
        rawResponse: JSON.stringify(body),
      };
    } catch (err: any) {
      this.logger.error(`GİB cancel hatası [uuid=${uuid}]: ${err?.message}`);
      return { success: false, errorMessage: err?.message };
    }
  }

  /**
   * XML imzalama hook'u.
   *
   * Üretim ortamında bu metod:
   * 1. Sertifika sağlayıcısına (HSM / entegratör) XML gönderir
   * 2. XAdES-BES imzalı XML'i alır
   * 3. İmzalı XML'i döner
   *
   * Şu an imzalamayı atlayıp XML'i olduğu gibi döner (test ortamı için yeterli).
   */
  signXml(rawXml: string): string {
    // TODO: Nitelikli e-imza entegrasyonu
    // Örnek: await qualifiedSignatureProvider.sign(rawXml, certPath, certPassword)
    this.logger.warn('XML imzalama atlandı — test modunda çalışıyor.');
    return rawXml;
  }
}
