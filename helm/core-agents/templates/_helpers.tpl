{{/*
Expand the name of the chart.
*/}}
{{- define "core-agents.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "core-agents.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "core-agents.labels" -}}
helm.sh/chart: {{ include "core-agents.name" . }}-{{ .Chart.Version | replace "+" "_" }}
{{ include "core-agents.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "core-agents.selectorLabels" -}}
app.kubernetes.io/name: {{ include "core-agents.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Database URL
*/}}
{{- define "core-agents.databaseUrl" -}}
{{- if .Values.databaseUrl }}
{{- .Values.databaseUrl }}
{{- else }}
{{- printf "postgres://%s:%s@%s-postgres:%s/%s" .Values.dbUser .Values.dbPassword (include "core-agents.fullname" .) "5432" .Values.dbName }}
{{- end }}
{{- end }}
