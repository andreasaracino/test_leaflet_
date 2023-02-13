from osgeo import gdal

filename=gdal.Open("file path")

metadata=filename.GetMetadata()

print(metadata)