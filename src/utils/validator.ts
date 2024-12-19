export function validatePayload(payload: any) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Payload inválido: deve ser um objeto JSON.");
  }

  if (!payload.method || !["GET", "POST", "PUT", "DELETE"].includes(payload.method.toUpperCase())) {
    throw new Error("Payload inválido: 'method' é obrigatório e deve ser GET, POST, PUT ou DELETE.");
  }

  if (!payload.url || typeof payload.url !== "string") {
    throw new Error("Payload inválido: 'url' é obrigatório e deve ser uma string válida.");
  }

  if (payload.data && typeof payload.data !== "object") {
    throw new Error("Payload inválido: 'data', se fornecido, deve ser um objeto JSON.");
  }

  if (payload.returnQueue && typeof payload.returnQueue !== "string") {
    throw new Error("Payload inválido: 'returnQueue', se fornecido, deve ser uma string.");
  }
}

