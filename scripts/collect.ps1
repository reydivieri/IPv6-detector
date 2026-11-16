$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$warnings = @()
$adapters = @(Get-NetAdapter -IncludeHidden | Where-Object { $_.HardwareInterface -or $_.Status -eq 'Up' })
$addresses = @(Get-NetIPAddress -ErrorAction Stop)
$allRoutes = @(Get-NetRoute -PolicyStore ActiveStore -ErrorAction Stop)
$routes = @($allRoutes | Where-Object { $_.DestinationPrefix -in @('0.0.0.0/0', '::/0') })
$ipInterfaces = @()
try { $ipInterfaces = @(Get-NetIPInterface -ErrorAction Stop) } catch { $warnings += 'Interface metrics could not be read.' }
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
$routeTable = @($allRoutes | ForEach-Object {
  $route = $_
  $interface = $ipInterfaces | Where-Object { $_.InterfaceIndex -eq $route.InterfaceIndex -and $_.AddressFamily -eq $route.AddressFamily } | Select-Object -First 1
  $adapter = $adapters | Where-Object { $_.ifIndex -eq $route.InterfaceIndex } | Select-Object -First 1
  [ordered]@{
    family = [string]$route.AddressFamily
    destination = $route.DestinationPrefix
    nextHop = $route.NextHop
    interfaceId = $route.InterfaceIndex
    interfaceName = $route.InterfaceAlias
    routeMetric = [int]$route.RouteMetric
    interfaceMetric = $(if ($null -ne $interface) { [int]$interface.InterfaceMetric } else { $null })
    active = $(if ($null -ne $interface) { [string]$interface.ConnectionState -eq 'Connected' -and [string]$route.State -ne 'Dead' } elseif ($null -ne $adapter) { [string]$adapter.Status -eq 'Up' } else { $null })
  }
})
$selectedRoutes = @('1.1.1.1', '2606:4700:4700::1111' | ForEach-Object {
  $target = $_
  try {
    $selection = @(Find-NetRoute -RemoteIPAddress $target -ErrorAction Stop)
    $bestRoute = $selection | Where-Object { $null -ne $_.DestinationPrefix } | Select-Object -First 1
    $source = $selection | Where-Object { $null -ne $_.IPAddress } | Select-Object -First 1
    if ($null -eq $bestRoute) { throw 'No selected route returned.' }
    @{ target = $target; found = $true; destination = $bestRoute.DestinationPrefix; nextHop = $bestRoute.NextHop; interfaceId = $bestRoute.InterfaceIndex; interfaceName = $bestRoute.InterfaceAlias; sourceAddress = $source.IPAddress }
  } catch { @{ target = $target; found = $false } }
})
[ordered]@{ system = $system; adapters = $networks; routeTable = $routeTable; selectedRoutes = $selectedRoutes; warnings = $warnings } | ConvertTo-Json -Depth 8 -Compress
