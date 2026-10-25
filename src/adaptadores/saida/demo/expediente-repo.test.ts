/* O expediente no adaptador de demonstração (24/10/2026).
 *
 * O fixture guarda o expediente em DOIS lugares: no profissional (é de onde a tela lê) e em
 * `EXPEDIENTE` (de onde `expediente()` e `atende`/`podeComecar` leem). Mudar só um deles faria a
 * Agenda e a MAISA discordarem sem erro nenhum, e é o que este teste impede. */

import { afterEach, describe, expect, it } from "vitest";
import { repositorioDemo } from "./repositorio";
import { EQUIPE, EXPEDIENTE, atende, podeComecar } from "./equipe";
import { NaoEncontrado } from "@/nucleo/dominio/erros";
import type { ContextoTenant } from "@/nucleo/dominio/tenant";

const T: ContextoTenant = { tenantId: "demo", usuarioId: "demo", ator: { tipo: "sistema", rotina: "demo-aberta" } };
const antes = { ...EQUIPE[0] };

afterEach(() => {
  EQUIPE[0] = { ...antes };
  EXPEDIENTE[antes.id] = { ...antes.expediente };
});

describe("salvarExpediente no demo", () => {
  it("muda o profissional e o EXPEDIENTE juntos, com as frases", async () => {
    const salvo = await repositorioDemo.salvarExpediente(T, {
      id: antes.id,
      expediente: { folga: [4, 5, 6], de: 8, ate: 20 },
      horario: "Seg–Qui 08–20",
      folga: "sexta, sábado e domingo",
    });

    expect(salvo.horario).toBe("Seg–Qui 08–20");
    expect(EQUIPE[0].expediente).toEqual({ folga: [4, 5, 6], de: 8, ate: 20 });
    expect(await repositorioDemo.expediente(T, antes.id)).toEqual({ folga: [4, 5, 6], de: 8, ate: 20 });
    expect((await repositorioDemo.profissional(T, antes.id))?.folga).toBe("sexta, sábado e domingo");
    /* Os atalhos da UI leem do `EXPEDIENTE`: 2026-10-23 é sexta (folga agora), 2026-10-22 é quinta. */
    expect(atende(antes.id, "2026-10-23")).toBe(false);
    expect(podeComecar(antes.id, "2026-10-22", 19.5)).toBe(true);
    expect(podeComecar(antes.id, "2026-10-22", 20)).toBe(false);
  });

  it("recusa o profissional que não existe", async () => {
    await expect(
      repositorioDemo.salvarExpediente(T, {
        id: "pr-404", expediente: { folga: [6], de: 9, ate: 19 }, horario: "Seg–Sáb 09–19", folga: "domingo",
      }),
    ).rejects.toThrow(NaoEncontrado);
  });
});
