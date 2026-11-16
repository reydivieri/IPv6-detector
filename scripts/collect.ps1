$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$warnings = @()
$adapters = @(Get-NetAdapter -IncludeHidden | Where-Object { $_.HardwareInterface -or $_.Status -eq 'Up' })
$addresses = @(Get-NetIPAddress -ErrorAction Stop)
$routes = @(Get-NetRoute -ErrorAction Stop | Where-Object { $_.DestinationPrefix -in @('0.0.0.0/0', '::/0') })
$dns = @(Get-DnsClientServerAddress -ErrorAction Stop)
$bindings = @()
try { $bindings = @(Get-NetAdapterBinding -ComponentID ms_tcpip6 -ErrorAction Stop) } catch { $warnings += 'IPv6 adapter bindings could not be read.' }
$profiles = @()
try { $profiles = @(Get-NetConnectionProfile -ErrorAction Stop) } catch { $warnings += 'Network profile names could not be read.' }
$system = $null
try {
  $os = Get-CimInstance Win32_OperatingSystem
  $computer = Get-CimInstance Win32_ComputerSystem
  $cpu = @(Get-CimInstance Win32_Processor)
  $system = [ordered]@{
    hostname = $env:COMPUTERNAME
    os = $os.Caption
    version = $os.Version
    architecture = $os.OSArchitecture
    cpu = ($cpu.Name -join ', ')
    logicalProcessors = $computer.NumberOfLogicalProcessors
    totalMemoryBytes = [double]$computer.TotalPhysicalMemory
    freeMemoryBytes = [double]$os.FreePhysicalMemory * 1024
  }
} catch { $warnings += 'Device specifications could not be read.' }
$networks = @($adapters | ForEach-Object {
  $adapter = $_
  $idx = $adapter.ifIndex
  $binding = $bindings | Where-Object { $_.Name -eq $adapter.Name } | Select-Object -First 1
  $profile = $profiles | Where-Object { $_.InterfaceIndex -eq $idx } | Select-Object -First 1
  [ordered]@{
    id = $idx
    name = $adapter.Name
    description = $adapter.InterfaceDescription
    status = [string]$adapter.Status
    linkSpeed = [string]$adapter.LinkSpeed
    mac = $adapter.MacAddress
    physical = [bool]$adapter.HardwareInterface
    networkName = $profile.Name
    ipv6Enabled = $(if ($null -ne $binding) { [bool]$binding.Enabled } else { $null })
    addresses = @($addresses | Where-Object { $_.InterfaceIndex -eq $idx } | ForEach-Object {
      @{ address = $_.IPAddress; family = [string]$_.AddressFamily; prefix = $_.PrefixLength; state = [string]$_.AddressState }
    })
    gateways = @($routes | Where-Object { $_.InterfaceIndex -eq $idx } | ForEach-Object {
      @{ address = $_.NextHop; family = [string]$_.AddressFamily; metric = $_.RouteMetric }
    })
    dns = @($dns | Where-Object { $_.InterfaceIndex -eq $idx } | ForEach-Object { $_.ServerAddresses } | Select-Object -Unique)
  }
})
[ordered]@{ system = $system; adapters = $networks; warnings = $warnings } | ConvertTo-Json -Depth 8 -Compress
